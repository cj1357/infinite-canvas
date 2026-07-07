package model

import (
	"time"

	"gorm.io/datatypes"
)

type UsageStatus string
type LedgerType string

const (
	UsageStatusReserved UsageStatus = "reserved"
	UsageStatusSettled  UsageStatus = "settled"
	UsageStatusFailed   UsageStatus = "failed"
	UsageStatusRefunded UsageStatus = "refunded"

	LedgerAdminGrant       LedgerType = "admin_grant"
	LedgerManualCharge     LedgerType = "manual_charge"
	LedgerReserve          LedgerType = "reserve"
	LedgerRefund           LedgerType = "refund"
	LedgerSettleAdjust     LedgerType = "settle_adjust"
	LedgerAdminResetPeriod LedgerType = "admin_reset_period"
	LedgerAdminResetShort  LedgerType = "admin_reset_short_window"
)

type UserCreditAccount struct {
	BaseModel
	UserID           string    `json:"userId" gorm:"uniqueIndex;size:36;not null"`
	BalanceCredits   int64     `json:"balanceCredits" gorm:"not null;default:0"`
	FiveHourLimit    int64     `json:"fiveHourLimit" gorm:"not null;default:0"`
	PeriodLimit      int64     `json:"periodLimit" gorm:"not null;default:0"`
	PeriodStart      time.Time `json:"periodStart" gorm:"index;not null"`
	PeriodEnd        time.Time `json:"periodEnd" gorm:"index;not null"`
	FiveHourResetAt  time.Time `json:"fiveHourResetAt" gorm:"index;not null"`
	PlanCode         string    `json:"planCode" gorm:"index;size:60"`
	ValidUntil       time.Time `json:"validUntil" gorm:"index;not null"`
	EntitlementNotes string    `json:"entitlementNotes" gorm:"size:500"`
}

type UsageRequest struct {
	BaseModel
	UserID          string         `json:"userId" gorm:"index;size:36;not null"`
	Status          UsageStatus    `json:"status" gorm:"index;size:20;not null"`
	Ability         string         `json:"ability" gorm:"index;size:60;not null"`
	Model           string         `json:"model" gorm:"index;size:120"`
	EstimateCredits int64          `json:"estimateCredits" gorm:"not null"`
	FinalCredits    int64          `json:"finalCredits" gorm:"not null;default:0"`
	ParamsJSON      datatypes.JSON `json:"paramsJson" gorm:"type:jsonb;not null;default:'{}'"`
	BillingSnapshot datatypes.JSON `json:"billingSnapshot" gorm:"type:jsonb;not null;default:'{}'"`
	ProviderRequest string         `json:"providerRequest" gorm:"size:120"`
	ErrorMessage     string         `json:"errorMessage" gorm:"type:text"`
	SettledAt        *time.Time     `json:"settledAt" gorm:"index"`
}

type CreditLedger struct {
	BaseModel
	UserID       string         `json:"userId" gorm:"index;size:36;not null"`
	AccountID    string         `json:"accountId" gorm:"index;size:36;not null"`
	UsageID      string         `json:"usageId" gorm:"index;size:36"`
	Type         LedgerType     `json:"type" gorm:"index;size:40;not null"`
	Amount       int64          `json:"amount" gorm:"not null"`
	BalanceAfter int64          `json:"balanceAfter" gorm:"not null"`
	Note         string         `json:"note" gorm:"size:500"`
	MetadataJSON datatypes.JSON `json:"metadataJson" gorm:"type:jsonb;not null;default:'{}'"`
	OperatorID   string         `json:"operatorId" gorm:"index;size:36"`
}

type ModelRateRule struct {
	BaseModel
	Ability                  string         `json:"ability" gorm:"uniqueIndex:idx_rate_rule;size:60;not null"`
	Model                    string         `json:"model" gorm:"uniqueIndex:idx_rate_rule;size:120;not null;default:''"`
	BaseCredits              int64          `json:"baseCredits" gorm:"not null;default:1"`
	UnitCredits              int64          `json:"unitCredits" gorm:"not null;default:0"`
	UnitParam                string         `json:"unitParam" gorm:"size:60"`
	PerOutputCredits         int64          `json:"perOutputCredits" gorm:"not null;default:0"`
	PerReferenceCredits      int64          `json:"perReferenceCredits" gorm:"not null;default:0"`
	ResolutionMultiplierJSON datatypes.JSON `json:"resolutionMultiplierJson" gorm:"type:jsonb;not null;default:'{}'"`
	QualityMultiplierJSON    datatypes.JSON `json:"qualityMultiplierJson" gorm:"type:jsonb;not null;default:'{}'"`
	Enabled                  bool           `json:"enabled" gorm:"index;not null;default:true"`
	Notes                    string         `json:"notes" gorm:"size:300"`
	ParamsJSON               datatypes.JSON `json:"paramsJson" gorm:"type:jsonb;not null;default:'{}'"`
}

type ModelCapability struct {
	BaseModel
	Model                         string         `json:"model" gorm:"uniqueIndex:idx_model_capability;size:120;not null"`
	DisplayNameJSON               datatypes.JSON `json:"displayNameJson" gorm:"type:jsonb;not null;default:'{}'"`
	Ability                       string         `json:"ability" gorm:"uniqueIndex:idx_model_capability;index;size:60;not null"`
	ModelFamily                   string         `json:"modelFamily" gorm:"index;size:80"`
	MaxReferences                 int            `json:"maxReferences" gorm:"not null;default:0"`
	MaxOutputs                    int            `json:"maxOutputs" gorm:"not null;default:1"`
	SupportedRatiosJSON          datatypes.JSON `json:"supportedRatiosJson" gorm:"type:jsonb;not null;default:'[]'"`
	SupportedResolutionsJSON     datatypes.JSON `json:"supportedResolutionsJson" gorm:"type:jsonb;not null;default:'[]'"`
	SupportsStreaming            bool           `json:"supportsStreaming" gorm:"not null;default:false"`
	SupportsSeed                 bool           `json:"supportsSeed" gorm:"not null;default:false"`
	SupportsMask                 bool           `json:"supportsMask" gorm:"not null;default:false"`
	SupportsCropReference        bool           `json:"supportsCropReference" gorm:"not null;default:false"`
	SupportsTransparentBackground bool           `json:"supportsTransparentBackground" gorm:"not null;default:false"`
	Enabled                      bool           `json:"enabled" gorm:"index;not null;default:true"`
	RecommendedRolesJSON         datatypes.JSON `json:"recommendedRolesJson" gorm:"type:jsonb;not null;default:'[]'"`
	MetadataJSON                 datatypes.JSON `json:"metadataJson" gorm:"type:jsonb;not null;default:'{}'"`
}

type PromptTemplate struct {
	BaseModel
	Locale        string         `json:"locale" gorm:"uniqueIndex:idx_prompt_template;index;size:20;not null"`
	TemplateKey   string         `json:"templateKey" gorm:"uniqueIndex:idx_prompt_template;index;size:120;not null"`
	Ability       string         `json:"ability" gorm:"uniqueIndex:idx_prompt_template;index;size:60;not null"`
	ModelFamily   string         `json:"modelFamily" gorm:"uniqueIndex:idx_prompt_template;index;size:80;not null;default:''"`
	Title         string         `json:"title" gorm:"size:160;not null"`
	Content       string         `json:"content" gorm:"type:text;not null"`
	VariablesJSON datatypes.JSON `json:"variablesJson" gorm:"type:jsonb;not null;default:'[]'"`
	Version       int            `json:"version" gorm:"uniqueIndex:idx_prompt_template;not null;default:1"`
	Enabled       bool           `json:"enabled" gorm:"index;not null;default:true"`
}

type Plan struct {
	BaseModel
	Code          string         `json:"code" gorm:"uniqueIndex;size:60;not null"`
	Name          string         `json:"name" gorm:"size:120;not null"`
	PriceCents    int64          `json:"priceCents" gorm:"not null;default:0"`
	Currency      string         `json:"currency" gorm:"size:20;not null;default:CNY"`
	BalanceGrant  int64          `json:"balanceGrant" gorm:"not null;default:0"`
	FiveHourLimit int64          `json:"fiveHourLimit" gorm:"not null;default:0"`
	PeriodLimit   int64          `json:"periodLimit" gorm:"not null;default:0"`
	PeriodDays    int            `json:"periodDays" gorm:"not null;default:7"`
	Enabled       bool           `json:"enabled" gorm:"index;not null;default:true"`
	MetadataJSON  datatypes.JSON `json:"metadataJson" gorm:"type:jsonb;not null;default:'{}'"`
}

type Order struct {
	BaseModel
	UserID       string         `json:"userId" gorm:"index;size:36;not null"`
	PlanCode     string         `json:"planCode" gorm:"index;size:60"`
	Provider     string         `json:"provider" gorm:"index;size:40;not null;default:manual"`
	ProviderNo   string         `json:"providerNo" gorm:"index;size:120"`
	Status       string         `json:"status" gorm:"index;size:30;not null"`
	AmountCents  int64          `json:"amountCents" gorm:"not null;default:0"`
	Currency     string         `json:"currency" gorm:"size:20;not null;default:CNY"`
	MetadataJSON datatypes.JSON `json:"metadataJson" gorm:"type:jsonb;not null;default:'{}'"`
}

type PaymentEvent struct {
	BaseModel
	OrderID      string         `json:"orderId" gorm:"index;size:36"`
	Provider     string         `json:"provider" gorm:"index;size:40;not null"`
	EventType    string         `json:"eventType" gorm:"index;size:80;not null"`
	EventID      string         `json:"eventId" gorm:"index;size:160"`
	PayloadJSON  datatypes.JSON `json:"payloadJson" gorm:"type:jsonb;not null;default:'{}'"`
	ProcessedAt  *time.Time     `json:"processedAt" gorm:"index"`
	ErrorMessage string         `json:"errorMessage" gorm:"type:text"`
}

type NewAPIConfig struct {
	BaseModel
	Name    string `json:"name" gorm:"uniqueIndex;size:60;not null;default:default"`
	BaseURL string `json:"baseUrl" gorm:"size:500;not null"`
	Token   string `json:"-" gorm:"type:text"`
	Enabled bool  `json:"enabled" gorm:"not null;default:true"`
}
