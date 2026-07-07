package service

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"time"

	"infinite-canvas/server/internal/model"
	"infinite-canvas/server/internal/repository"

	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type BillingService struct {
	repo *repository.Repository
}

type EstimateRequest struct {
	Ability string         `json:"ability"`
	Model   string         `json:"model"`
	Params  map[string]any `json:"params"`
}

type EstimateResponse struct {
	EstimateCredits int64               `json:"estimateCredits"`
	Ability         string              `json:"ability"`
	Model           string              `json:"model"`
	Rule            *model.ModelRateRule `json:"rule,omitempty"`
}

type BillingSummary struct {
	Account                 model.UserCreditAccount `json:"account"`
	FiveHourUsed            int64                   `json:"fiveHourUsed"`
	FiveHourRemaining       int64                   `json:"fiveHourRemaining"`
	FiveHourNextRestoreAt   time.Time               `json:"fiveHourNextRestoreAt"`
	PeriodUsed              int64                   `json:"periodUsed"`
	PeriodRemaining         int64                   `json:"periodRemaining"`
	PeriodRemainingPercent  float64                 `json:"periodRemainingPercent"`
	EntitlementActive       bool                    `json:"entitlementActive"`
	EntitlementExpired      bool                    `json:"entitlementExpired"`
}

type GrantEntitlementRequest struct {
	PlanCode       string `json:"planCode"`
	BalanceGrant   int64  `json:"balanceGrant"`
	FiveHourLimit  int64  `json:"fiveHourLimit"`
	PeriodLimit    int64  `json:"periodLimit"`
	ValidDays      int    `json:"validDays"`
	Note           string `json:"note"`
}

type AdjustCreditsRequest struct {
	Mode   string `json:"mode"`
	Amount int64  `json:"amount"`
	Note   string `json:"note"`
}

func NewBillingService(repo *repository.Repository) *BillingService {
	return &BillingService{repo: repo}
}

func (s *BillingService) Estimate(req EstimateRequest) (EstimateResponse, error) {
	if req.Ability == "" {
		return EstimateResponse{}, errors.New("ability 不能为空")
	}
	rule, estimate, err := s.estimateCredits(req.Ability, req.Model, req.Params)
	if err != nil {
		return EstimateResponse{}, err
	}
	return EstimateResponse{EstimateCredits: estimate, Ability: req.Ability, Model: req.Model, Rule: rule}, nil
}

func (s *BillingService) Summary(userID string) (BillingSummary, error) {
	account, err := s.ensureAccount(userID)
	if err != nil {
		return BillingSummary{}, err
	}
	now := time.Now()
	shortSince := laterTime(now.Add(-5*time.Hour), account.FiveHourResetAt)
	fiveUsed, err := s.repo.SumUsageCredits(userID, shortSince)
	if err != nil {
		return BillingSummary{}, err
	}
	periodUsed, err := s.repo.SumUsageCredits(userID, account.PeriodStart)
	if err != nil {
		return BillingSummary{}, err
	}
	return buildBillingSummary(account, fiveUsed, periodUsed, now), nil
}

func (s *BillingService) Reserve(ctx context.Context, userID string, req EstimateRequest) (model.UsageRequest, error) {
	var usage model.UsageRequest
	err := s.repo.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		txRepo := s.repo.WithTx(tx)
		account, err := txRepo.GetCreditAccountForUpdate(userID)
		if errors.Is(err, gorm.ErrRecordNotFound) {
			account = defaultCreditAccount(userID, time.Now())
			if err := txRepo.SaveCreditAccount(&account); err != nil {
				return err
			}
			account, err = txRepo.GetCreditAccountForUpdate(userID)
		}
		if err != nil {
			return err
		}
		now := time.Now()
		if err := advancePeriodIfNeeded(txRepo, &account, now); err != nil {
			return err
		}
		if !now.Before(account.ValidUntil) {
			return errors.New("会员权益已过期，请联系管理员开通或续费")
		}
		_, estimate, err := s.estimateCredits(req.Ability, req.Model, req.Params)
		if err != nil {
			return err
		}
		if estimate <= 0 {
			return errors.New("预计消耗必须大于 0")
		}
		shortSince := laterTime(now.Add(-5*time.Hour), account.FiveHourResetAt)
		fiveUsed, err := txRepo.SumUsageCredits(userID, shortSince)
		if err != nil {
			return err
		}
		periodUsed, err := txRepo.SumUsageCredits(userID, account.PeriodStart)
		if err != nil {
			return err
		}
		if estimate > account.BalanceCredits {
			return errors.New("总额度不足")
		}
		if account.FiveHourLimit <= 0 || fiveUsed+estimate > account.FiveHourLimit {
			return errors.New("最近 5 小时额度不足")
		}
		if account.PeriodLimit <= 0 || periodUsed+estimate > account.PeriodLimit {
			return errors.New("当前 7 天周期额度不足")
		}
		paramsJSON := mustJSON(req.Params)
		snapshot := mustJSON(map[string]any{
			"balanceCredits": account.BalanceCredits,
			"fiveHourLimit":  account.FiveHourLimit,
			"fiveHourUsed":   fiveUsed,
			"periodLimit":    account.PeriodLimit,
			"periodUsed":     periodUsed,
			"periodStart":    account.PeriodStart,
			"periodEnd":      account.PeriodEnd,
			"planCode":       account.PlanCode,
		})
		account.BalanceCredits -= estimate
		if err := txRepo.SaveCreditAccount(&account); err != nil {
			return err
		}
		usage = model.UsageRequest{
			UserID:          userID,
			Status:          model.UsageStatusReserved,
			Ability:         req.Ability,
			Model:           req.Model,
			EstimateCredits: estimate,
			ParamsJSON:      paramsJSON,
			BillingSnapshot: snapshot,
		}
		if err := txRepo.CreateUsageRequest(&usage); err != nil {
			return err
		}
		return txRepo.CreateCreditLedger(&model.CreditLedger{
			UserID:       userID,
			AccountID:    account.ID,
			UsageID:      usage.ID,
			Type:         model.LedgerReserve,
			Amount:       -estimate,
			BalanceAfter: account.BalanceCredits,
			MetadataJSON: paramsJSON,
		})
	})
	return usage, err
}

func (s *BillingService) Settle(ctx context.Context, usageID string, finalCredits int64) error {
	return s.repo.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		txRepo := s.repo.WithTx(tx)
		usage, err := txRepo.GetUsageRequestForUpdate(usageID)
		if err != nil {
			return err
		}
		if usage.Status != model.UsageStatusReserved {
			return nil
		}
		account, err := txRepo.GetCreditAccountForUpdate(usage.UserID)
		if err != nil {
			return err
		}
		if finalCredits <= 0 {
			finalCredits = usage.EstimateCredits
		}
		delta := usage.EstimateCredits - finalCredits
		account.BalanceCredits += delta
		now := time.Now()
		usage.Status = model.UsageStatusSettled
		usage.FinalCredits = finalCredits
		usage.SettledAt = &now
		if err := txRepo.SaveCreditAccount(&account); err != nil {
			return err
		}
		if err := txRepo.SaveUsageRequest(&usage); err != nil {
			return err
		}
		if delta == 0 {
			return nil
		}
		ledgerType := model.LedgerRefund
		if delta < 0 {
			ledgerType = model.LedgerSettleAdjust
		}
		return txRepo.CreateCreditLedger(&model.CreditLedger{
			UserID:       usage.UserID,
			AccountID:    account.ID,
			UsageID:      usage.ID,
			Type:         ledgerType,
			Amount:       delta,
			BalanceAfter: account.BalanceCredits,
			Note:         "按实际消耗结算差额",
		})
	})
}

func (s *BillingService) Fail(ctx context.Context, usageID string, message string) error {
	return s.repo.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		txRepo := s.repo.WithTx(tx)
		usage, err := txRepo.GetUsageRequestForUpdate(usageID)
		if err != nil {
			return err
		}
		if usage.Status != model.UsageStatusReserved {
			return nil
		}
		account, err := txRepo.GetCreditAccountForUpdate(usage.UserID)
		if err != nil {
			return err
		}
		account.BalanceCredits += usage.EstimateCredits
		now := time.Now()
		usage.Status = model.UsageStatusFailed
		usage.ErrorMessage = message
		usage.SettledAt = &now
		if err := txRepo.SaveCreditAccount(&account); err != nil {
			return err
		}
		if err := txRepo.SaveUsageRequest(&usage); err != nil {
			return err
		}
		return txRepo.CreateCreditLedger(&model.CreditLedger{
			UserID:       usage.UserID,
			AccountID:    account.ID,
			UsageID:      usage.ID,
			Type:         model.LedgerRefund,
			Amount:       usage.EstimateCredits,
			BalanceAfter: account.BalanceCredits,
			Note:         "生成失败全额退回",
		})
	})
}

func (s *BillingService) GrantEntitlement(ctx context.Context, operatorID string, userID string, req GrantEntitlementRequest) (model.UserCreditAccount, error) {
	var account model.UserCreditAccount
	err := s.repo.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		txRepo := s.repo.WithTx(tx)
		var err error
		account, err = txRepo.GetCreditAccountForUpdate(userID)
		if errors.Is(err, gorm.ErrRecordNotFound) {
			account = defaultCreditAccount(userID, time.Now())
		} else if err != nil {
			return err
		}
		now := time.Now()
		validDays := req.ValidDays
		if validDays <= 0 {
			validDays = 30
		}
		account.PlanCode = req.PlanCode
		account.FiveHourLimit = req.FiveHourLimit
		account.PeriodLimit = req.PeriodLimit
		account.PeriodStart = now
		account.PeriodEnd = now.AddDate(0, 0, 7)
		account.ValidUntil = now.AddDate(0, 0, validDays)
		if req.BalanceGrant != 0 {
			account.BalanceCredits += req.BalanceGrant
		}
		account.EntitlementNotes = req.Note
		if err := txRepo.SaveCreditAccount(&account); err != nil {
			return err
		}
		if req.BalanceGrant == 0 {
			return nil
		}
		return txRepo.CreateCreditLedger(&model.CreditLedger{
			UserID:       userID,
			AccountID:    account.ID,
			Type:         model.LedgerAdminGrant,
			Amount:       req.BalanceGrant,
			BalanceAfter: account.BalanceCredits,
			Note:         req.Note,
			OperatorID:   operatorID,
		})
	})
	return account, err
}

func (s *BillingService) AdjustCredits(ctx context.Context, operatorID string, userID string, req AdjustCreditsRequest) (model.UserCreditAccount, error) {
	if req.Amount < 0 {
		return model.UserCreditAccount{}, errors.New("amount 不能为负数")
	}
	var account model.UserCreditAccount
	err := s.repo.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		txRepo := s.repo.WithTx(tx)
		var err error
		account, err = txRepo.GetCreditAccountForUpdate(userID)
		if err != nil {
			return err
		}
		before := account.BalanceCredits
		switch req.Mode {
		case "add":
			account.BalanceCredits += req.Amount
		case "subtract":
			account.BalanceCredits -= req.Amount
		case "set":
			account.BalanceCredits = req.Amount
		default:
			return errors.New("mode 只支持 add、subtract、set")
		}
		if err := txRepo.SaveCreditAccount(&account); err != nil {
			return err
		}
		return txRepo.CreateCreditLedger(&model.CreditLedger{
			UserID:       userID,
			AccountID:    account.ID,
			Type:         model.LedgerManualCharge,
			Amount:       account.BalanceCredits - before,
			BalanceAfter: account.BalanceCredits,
			Note:         req.Note,
			OperatorID:   operatorID,
		})
	})
	return account, err
}

func (s *BillingService) ResetPeriod(ctx context.Context, operatorID string, userID string) (model.UserCreditAccount, error) {
	return s.resetAccount(ctx, operatorID, userID, model.LedgerAdminResetPeriod, func(account *model.UserCreditAccount, now time.Time) {
		account.PeriodStart = now
		account.PeriodEnd = now.AddDate(0, 0, 7)
	})
}

func (s *BillingService) ResetFiveHourWindow(ctx context.Context, operatorID string, userID string) (model.UserCreditAccount, error) {
	return s.resetAccount(ctx, operatorID, userID, model.LedgerAdminResetShort, func(account *model.UserCreditAccount, now time.Time) {
		account.FiveHourResetAt = now
	})
}

func (s *BillingService) resetAccount(ctx context.Context, operatorID string, userID string, ledgerType model.LedgerType, apply func(*model.UserCreditAccount, time.Time)) (model.UserCreditAccount, error) {
	var account model.UserCreditAccount
	err := s.repo.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		txRepo := s.repo.WithTx(tx)
		var err error
		account, err = txRepo.GetCreditAccountForUpdate(userID)
		if err != nil {
			return err
		}
		apply(&account, time.Now())
		if err := txRepo.SaveCreditAccount(&account); err != nil {
			return err
		}
		return txRepo.CreateCreditLedger(&model.CreditLedger{
			UserID:       userID,
			AccountID:    account.ID,
			Type:         ledgerType,
			Amount:       0,
			BalanceAfter: account.BalanceCredits,
			OperatorID:   operatorID,
		})
	})
	return account, err
}

func (s *BillingService) ListUsage(userID string, q model.Query) (model.ListResult[model.UsageRequest], error) {
	return s.repo.ListUsageRequests(userID, q)
}

func (s *BillingService) ListLedger(userID string, q model.Query) (model.ListResult[model.CreditLedger], error) {
	return s.repo.ListCreditLedger(userID, q)
}

func (s *BillingService) ListRateRules(q model.Query) (model.ListResult[model.ModelRateRule], error) {
	return s.repo.ListModelRateRules(q)
}

func (s *BillingService) SaveRateRule(item *model.ModelRateRule) error {
	return s.repo.SaveModelRateRule(item)
}

func (s *BillingService) ensureAccount(userID string) (model.UserCreditAccount, error) {
	account, err := s.repo.GetCreditAccount(userID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		account = defaultCreditAccount(userID, time.Now())
		err = s.repo.SaveCreditAccount(&account)
	}
	return account, err
}

func (s *BillingService) estimateCredits(ability string, modelName string, params map[string]any) (*model.ModelRateRule, int64, error) {
	rule, err := s.repo.FindModelRateRule(ability, modelName)
	if err == nil {
		return &rule, applyRateRule(rule, params), nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, 0, err
	}
	estimate := defaultEstimateCredits(ability, params)
	return nil, estimate, nil
}

func applyRateRule(rule model.ModelRateRule, params map[string]any) int64 {
	credits := float64(rule.BaseCredits)
	outputs := math.Max(1, firstNumberParam(params, "outputs", "n", "count"))
	references := math.Max(0, firstNumberParam(params, "references", "referenceCount", "reference_count"))
	if rule.PerOutputCredits > 0 {
		credits += outputs * float64(rule.PerOutputCredits)
	}
	if rule.PerReferenceCredits > 0 {
		credits += references * float64(rule.PerReferenceCredits)
	}
	if rule.UnitCredits > 0 && rule.UnitParam != "" {
		credits += math.Ceil(numberParam(params, rule.UnitParam)) * float64(rule.UnitCredits)
	}
	credits *= multiplierParam(rule.ResolutionMultiplierJSON, stringParam(params, "resolution"), stringParam(params, "size"))
	credits *= multiplierParam(rule.QualityMultiplierJSON, stringParam(params, "quality"))
	if credits <= 0 {
		return 1
	}
	return int64(math.Ceil(credits))
}

func defaultEstimateCredits(ability string, params map[string]any) int64 {
	count := int64(math.Max(1, numberParam(params, "n")))
	if count == 1 {
		count = int64(math.Max(1, numberParam(params, "count")))
	}
	switch ability {
	case "image_generation":
		return 10 * count
	case "image_edit":
		return 12 * count
	case "audio_speech":
		return 3
	case "video":
		return 80
	case "text_response":
		return 1
	default:
		return 1
	}
}

func numberParam(params map[string]any, key string) float64 {
	if params == nil {
		return 0
	}
	switch value := params[key].(type) {
	case float64:
		return value
	case float32:
		return float64(value)
	case int:
		return float64(value)
	case int64:
		return float64(value)
	case json.Number:
		n, _ := value.Float64()
		return n
	default:
		return 0
	}
}

func firstNumberParam(params map[string]any, keys ...string) float64 {
	for _, key := range keys {
		if value := numberParam(params, key); value > 0 {
			return value
		}
	}
	return 0
}

func stringParam(params map[string]any, key string) string {
	if params == nil {
		return ""
	}
	if value, ok := params[key].(string); ok {
		return value
	}
	return ""
}

func multiplierParam(raw datatypes.JSON, keys ...string) float64 {
	if len(raw) == 0 || string(raw) == "null" {
		return 1
	}
	values := map[string]float64{}
	if err := json.Unmarshal(raw, &values); err != nil {
		return 1
	}
	for _, key := range keys {
		if value := values[key]; value > 0 {
			return value
		}
	}
	return 1
}

func advancePeriodIfNeeded(repo *repository.Repository, account *model.UserCreditAccount, now time.Time) error {
	if now.Before(account.PeriodEnd) || !now.Before(account.ValidUntil) {
		return nil
	}
	account.PeriodStart = now
	account.PeriodEnd = now.AddDate(0, 0, 7)
	return repo.SaveCreditAccount(account)
}

func buildBillingSummary(account model.UserCreditAccount, fiveUsed int64, periodUsed int64, now time.Time) BillingSummary {
	periodRemaining := account.PeriodLimit - periodUsed
	if periodRemaining < 0 {
		periodRemaining = 0
	}
	fiveRemaining := account.FiveHourLimit - fiveUsed
	if fiveRemaining < 0 {
		fiveRemaining = 0
	}
	percent := 0.0
	if account.PeriodLimit > 0 {
		percent = float64(periodRemaining) / float64(account.PeriodLimit) * 100
	}
	return BillingSummary{
		Account:                account,
		FiveHourUsed:           fiveUsed,
		FiveHourRemaining:      fiveRemaining,
		FiveHourNextRestoreAt:  laterTime(now.Add(5*time.Hour), account.FiveHourResetAt.Add(5*time.Hour)),
		PeriodUsed:             periodUsed,
		PeriodRemaining:        periodRemaining,
		PeriodRemainingPercent: math.Round(percent*100) / 100,
		EntitlementActive:      now.Before(account.ValidUntil),
		EntitlementExpired:     !now.Before(account.ValidUntil),
	}
}

func mustJSON(value any) datatypes.JSON {
	if value == nil {
		return datatypes.JSON([]byte("{}"))
	}
	data, err := json.Marshal(value)
	if err != nil {
		return datatypes.JSON([]byte("{}"))
	}
	return datatypes.JSON(data)
}

func laterTime(a time.Time, b time.Time) time.Time {
	if a.After(b) {
		return a
	}
	return b
}
