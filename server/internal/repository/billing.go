package repository

import (
	"time"

	"infinite-canvas/server/internal/model"

	"gorm.io/gorm/clause"
)

func (r *Repository) GetCreditAccount(userID string) (model.UserCreditAccount, error) {
	var account model.UserCreditAccount
	err := r.DB.First(&account, "user_id = ?", userID).Error
	return account, err
}

func (r *Repository) GetCreditAccountForUpdate(userID string) (model.UserCreditAccount, error) {
	var account model.UserCreditAccount
	err := r.DB.Clauses(clause.Locking{Strength: "UPDATE"}).First(&account, "user_id = ?", userID).Error
	return account, err
}

func (r *Repository) SaveCreditAccount(account *model.UserCreditAccount) error {
	return r.DB.Save(account).Error
}

func (r *Repository) CreateUsageRequest(usage *model.UsageRequest) error {
	return r.DB.Create(usage).Error
}

func (r *Repository) GetUsageRequestForUpdate(id string) (model.UsageRequest, error) {
	var usage model.UsageRequest
	err := r.DB.Clauses(clause.Locking{Strength: "UPDATE"}).First(&usage, "id = ?", id).Error
	return usage, err
}

func (r *Repository) SaveUsageRequest(usage *model.UsageRequest) error {
	return r.DB.Save(usage).Error
}

func (r *Repository) CreateCreditLedger(item *model.CreditLedger) error {
	return r.DB.Create(item).Error
}

func (r *Repository) SumUsageCredits(userID string, since time.Time) (int64, error) {
	type row struct {
		Total int64
	}
	var result row
	err := r.DB.Model(&model.UsageRequest{}).
		Select("COALESCE(SUM(CASE WHEN status = ? THEN estimate_credits WHEN status = ? THEN final_credits ELSE 0 END), 0) AS total", model.UsageStatusReserved, model.UsageStatusSettled).
		Where("user_id = ? AND created_at >= ? AND status IN ?", userID, since, []model.UsageStatus{model.UsageStatusReserved, model.UsageStatusSettled}).
		Scan(&result).Error
	return result.Total, err
}

func (r *Repository) ListUsageRequests(userID string, q model.Query) (model.ListResult[model.UsageRequest], error) {
	q.Normalize()
	db := r.DB.Model(&model.UsageRequest{}).Where("user_id = ?", userID)
	if q.Keyword != "" {
		db = db.Where("model ILIKE ? OR ability ILIKE ?", "%"+q.Keyword+"%", "%"+q.Keyword+"%")
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return model.ListResult[model.UsageRequest]{}, err
	}
	var items []model.UsageRequest
	err := db.Order("created_at DESC").Limit(q.PageSize).Offset(q.Offset()).Find(&items).Error
	return model.ListResult[model.UsageRequest]{Items: items, Total: total, Page: q.Page, Size: q.PageSize}, err
}

func (r *Repository) ListCreditLedger(userID string, q model.Query) (model.ListResult[model.CreditLedger], error) {
	q.Normalize()
	db := r.DB.Model(&model.CreditLedger{}).Where("user_id = ?", userID)
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return model.ListResult[model.CreditLedger]{}, err
	}
	var items []model.CreditLedger
	err := db.Order("created_at DESC").Limit(q.PageSize).Offset(q.Offset()).Find(&items).Error
	return model.ListResult[model.CreditLedger]{Items: items, Total: total, Page: q.Page, Size: q.PageSize}, err
}

func (r *Repository) FindModelRateRule(ability string, modelName string) (model.ModelRateRule, error) {
	var item model.ModelRateRule
	err := r.DB.First(&item, "ability = ? AND enabled = ? AND model = ?", ability, true, modelName).Error
	if err == nil || modelName == "" {
		return item, err
	}
	err = r.DB.First(&item, "ability = ? AND enabled = ? AND model = ''", ability, true).Error
	return item, err
}

func (r *Repository) ListModelRateRules(q model.Query) (model.ListResult[model.ModelRateRule], error) {
	q.Normalize()
	db := r.DB.Model(&model.ModelRateRule{})
	if q.Keyword != "" {
		db = db.Where("model ILIKE ? OR ability ILIKE ?", "%"+q.Keyword+"%", "%"+q.Keyword+"%")
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return model.ListResult[model.ModelRateRule]{}, err
	}
	var items []model.ModelRateRule
	err := db.Order("ability ASC, model ASC").Limit(q.PageSize).Offset(q.Offset()).Find(&items).Error
	return model.ListResult[model.ModelRateRule]{Items: items, Total: total, Page: q.Page, Size: q.PageSize}, err
}

func (r *Repository) SaveModelRateRule(item *model.ModelRateRule) error {
	return r.DB.Save(item).Error
}
