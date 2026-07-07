package model

import (
	"time"

	"gorm.io/datatypes"
)

type CanvasProject struct {
	BaseModel
	UserID       string         `json:"userId" gorm:"index;size:36;not null"`
	Title        string         `json:"title" gorm:"size:160;not null"`
	Description  string         `json:"description" gorm:"size:500"`
	DataJSON     datatypes.JSON `json:"dataJson" gorm:"type:jsonb;not null;default:'{}'"`
	MetadataJSON datatypes.JSON `json:"metadataJson" gorm:"type:jsonb;not null;default:'{}'"`
	Version      int            `json:"version" gorm:"not null;default:1"`
}

type Asset struct {
	BaseModel
	UserID     string         `json:"userId" gorm:"index;size:36;not null"`
	Kind       string         `json:"kind" gorm:"index;size:40;not null"`
	Title      string         `json:"title" gorm:"size:160;not null"`
	StorageKey string         `json:"storageKey" gorm:"index;size:160"`
	TagsJSON   datatypes.JSON `json:"tagsJson" gorm:"type:jsonb;not null;default:'[]'"`
	DataJSON   datatypes.JSON `json:"dataJson" gorm:"type:jsonb;not null;default:'{}'"`
}

type GenerationLog struct {
	BaseModel
	UserID       string         `json:"userId" gorm:"index;size:36;not null"`
	ProjectID    string         `json:"projectId" gorm:"index;size:36"`
	Ability      string         `json:"ability" gorm:"index;size:60;not null"`
	Model        string         `json:"model" gorm:"index;size:120"`
	Status       string         `json:"status" gorm:"index;size:30;not null"`
	Prompt       string         `json:"prompt" gorm:"type:text"`
	ResultJSON   datatypes.JSON `json:"resultJson" gorm:"type:jsonb;not null;default:'{}'"`
	ParamsJSON   datatypes.JSON `json:"paramsJson" gorm:"type:jsonb;not null;default:'{}'"`
	UsageID      string         `json:"usageId" gorm:"index;size:36"`
	ErrorMessage string         `json:"errorMessage" gorm:"type:text"`
}

type MediaObject struct {
	BaseModel
	UserID       string         `json:"userId" gorm:"index;size:36;not null"`
	Kind         string         `json:"kind" gorm:"index;size:30;not null"`
	StorageKey   string         `json:"storageKey" gorm:"uniqueIndex;size:260;not null"`
	ThumbnailKey string         `json:"thumbnailKey" gorm:"size:260"`
	MimeType     string         `json:"mimeType" gorm:"size:120"`
	ContentType  string         `json:"contentType" gorm:"size:120"`
	ObjectKey    string         `json:"objectKey" gorm:"size:260"`
	ByteSize     int64          `json:"byteSize"`
	Width        int            `json:"width"`
	Height       int            `json:"height"`
	DurationMs   int64          `json:"durationMs"`
	Sha256       string         `json:"sha256" gorm:"size:64"`
	MetadataJSON datatypes.JSON `json:"metadataJson" gorm:"type:jsonb;not null;default:'{}'"`
}

type CreativeAsset struct {
	BaseModel
	UserID                     string         `json:"userId" gorm:"index;size:36;not null"`
	MediaObjectID              string         `json:"mediaObjectId" gorm:"index;size:36"`
	Kind                       string         `json:"kind" gorm:"index;size:40;not null"`
	Title                      string         `json:"title" gorm:"size:160;not null"`
	Description                string         `json:"description" gorm:"size:500"`
	TagsJSON                   datatypes.JSON `json:"tagsJson" gorm:"type:jsonb;not null;default:'[]'"`
	Favorite                   bool           `json:"favorite" gorm:"index;not null;default:false"`
	Rating                     int            `json:"rating" gorm:"index;not null;default:0"`
	DefaultReferenceIntentJSON datatypes.JSON `json:"defaultReferenceIntentJson" gorm:"type:jsonb;not null;default:'{}'"`
	LocalizedTextJSON          datatypes.JSON `json:"localizedTextJson" gorm:"type:jsonb;not null;default:'{}'"`
	UsageCount                 int64          `json:"usageCount" gorm:"not null;default:0"`
	LastUsedAt                 *time.Time     `json:"lastUsedAt" gorm:"index"`
	MetadataJSON               datatypes.JSON `json:"metadataJson" gorm:"type:jsonb;not null;default:'{}'"`
}

type ReferenceSet struct {
	BaseModel
	UserID       string         `json:"userId" gorm:"index;size:36;not null"`
	ProjectID    string         `json:"projectId" gorm:"index;size:36"`
	Title        string         `json:"title" gorm:"size:160;not null"`
	Description  string         `json:"description" gorm:"size:500"`
	Source       string         `json:"source" gorm:"index;size:40"`
	MetadataJSON datatypes.JSON `json:"metadataJson" gorm:"type:jsonb;not null;default:'{}'"`
}

type ReferenceIntent struct {
	BaseModel
	UserID         string         `json:"userId" gorm:"index;size:36;not null"`
	ReferenceSetID string         `json:"referenceSetId" gorm:"index;size:36;not null"`
	AssetID        string         `json:"assetId" gorm:"index;size:36"`
	MediaObjectID  string         `json:"mediaObjectId" gorm:"index;size:36"`
	Role           string         `json:"role" gorm:"index;size:40;not null"`
	Weight         float64        `json:"weight" gorm:"not null;default:1"`
	Enabled        bool           `json:"enabled" gorm:"index;not null;default:true"`
	SortOrder      int            `json:"sortOrder" gorm:"index;not null;default:0"`
	Note           string         `json:"note" gorm:"size:500"`
	CropJSON       datatypes.JSON `json:"cropJson" gorm:"type:jsonb;not null;default:'{}'"`
	AnalysisJSON   datatypes.JSON `json:"analysisJson" gorm:"type:jsonb;not null;default:'{}'"`
	Confirmed      bool           `json:"confirmed" gorm:"index;not null;default:false"`
	MetadataJSON   datatypes.JSON `json:"metadataJson" gorm:"type:jsonb;not null;default:'{}'"`
}

type GenerationRun struct {
	BaseModel
	UserID                string         `json:"userId" gorm:"index;size:36;not null"`
	ProjectID             string         `json:"projectId" gorm:"index;size:36"`
	ReferenceSetID        string         `json:"referenceSetId" gorm:"index;size:36"`
	ParentRunID           string         `json:"parentRunId" gorm:"index;size:36"`
	Ability               string         `json:"ability" gorm:"index;size:60;not null"`
	Model                 string         `json:"model" gorm:"index;size:120"`
	Prompt                string         `json:"prompt" gorm:"type:text"`
	CompiledPrompt        string         `json:"compiledPrompt" gorm:"type:text"`
	CompiledLocale        string         `json:"compiledLocale" gorm:"index;size:20"`
	CompiledTemplateKey   string         `json:"compiledTemplateKey" gorm:"index;size:120"`
	CompiledReferenceJSON datatypes.JSON `json:"compiledReferenceJson" gorm:"type:jsonb;not null;default:'{}'"`
	ParamsJSON            datatypes.JSON `json:"paramsJson" gorm:"type:jsonb;not null;default:'{}'"`
	Status                string         `json:"status" gorm:"index;size:30;not null;default:queued"`
	ReservedCredits       int64          `json:"reservedCredits" gorm:"not null;default:0"`
	SettledCredits        int64          `json:"settledCredits" gorm:"not null;default:0"`
	UsageID               string         `json:"usageId" gorm:"index;size:36"`
	Gateway               string         `json:"gateway" gorm:"index;size:40"`
	GatewayRequestID      string         `json:"gatewayRequestId" gorm:"index;size:120"`
	GatewayModel          string         `json:"gatewayModel" gorm:"index;size:120"`
	GatewayUsageJSON      datatypes.JSON `json:"gatewayUsageJson" gorm:"type:jsonb;not null;default:'{}'"`
	GatewayCostJSON       datatypes.JSON `json:"gatewayCostJson" gorm:"type:jsonb;not null;default:'{}'"`
	GatewayErrorJSON      datatypes.JSON `json:"gatewayErrorJson" gorm:"type:jsonb;not null;default:'{}'"`
	ErrorKey              string         `json:"errorKey" gorm:"index;size:120"`
	ErrorMessage          string         `json:"errorMessage" gorm:"type:text"`
}

type GenerationOutput struct {
	BaseModel
	UserID          string         `json:"userId" gorm:"index;size:36;not null"`
	GenerationRunID string         `json:"generationRunId" gorm:"index;size:36;not null"`
	MediaObjectID   string         `json:"mediaObjectId" gorm:"index;size:36"`
	CanvasNodeID    string         `json:"canvasNodeId" gorm:"index;size:80"`
	Status          string         `json:"status" gorm:"index;size:30;not null"`
	Rating          int            `json:"rating" gorm:"index;not null;default:0"`
	Selected        bool           `json:"selected" gorm:"index;not null;default:false"`
	Note            string         `json:"note" gorm:"size:500"`
	MetadataJSON    datatypes.JSON `json:"metadataJson" gorm:"type:jsonb;not null;default:'{}'"`
}

type GenerationJob struct {
	BaseModel
	UserID          string         `json:"userId" gorm:"index;size:36;not null"`
	GenerationRunID string         `json:"generationRunId" gorm:"index;size:36;not null"`
	Status          string         `json:"status" gorm:"index;size:30;not null;default:queued"`
	Ability         string         `json:"ability" gorm:"index;size:60;not null"`
	Priority        int            `json:"priority" gorm:"index;not null;default:0"`
	Attempt         int            `json:"attempt" gorm:"not null;default:0"`
	MaxAttempts     int            `json:"maxAttempts" gorm:"not null;default:3"`
	LockedAt        *time.Time     `json:"lockedAt" gorm:"index"`
	StartedAt       *time.Time     `json:"startedAt" gorm:"index"`
	FinishedAt      *time.Time     `json:"finishedAt" gorm:"index"`
	NextRetryAt     *time.Time     `json:"nextRetryAt" gorm:"index"`
	ErrorKey        string         `json:"errorKey" gorm:"index;size:120"`
	ErrorCode       string         `json:"errorCode" gorm:"size:120"`
	ErrorMessage    string         `json:"errorMessage" gorm:"type:text"`
	RequestJSON     datatypes.JSON `json:"requestJson" gorm:"type:jsonb;not null;default:'{}'"`
	ResponseJSON    datatypes.JSON `json:"responseJson" gorm:"type:jsonb;not null;default:'{}'"`
}

type AgentSession struct {
	BaseModel
	UserID       string         `json:"userId" gorm:"index;size:36;not null"`
	ProjectID    string         `json:"projectId" gorm:"index;size:36"`
	Title        string         `json:"title" gorm:"size:160;not null"`
	Locale       string         `json:"locale" gorm:"index;size:20"`
	Status       string         `json:"status" gorm:"index;size:30;not null;default:active"`
	MetadataJSON datatypes.JSON `json:"metadataJson" gorm:"type:jsonb;not null;default:'{}'"`
}

type AgentMessage struct {
	BaseModel
	UserID       string         `json:"userId" gorm:"index;size:36;not null"`
	SessionID    string         `json:"sessionId" gorm:"index;size:36;not null"`
	Role         string         `json:"role" gorm:"index;size:30;not null"`
	Content      string         `json:"content" gorm:"type:text"`
	MetadataJSON datatypes.JSON `json:"metadataJson" gorm:"type:jsonb;not null;default:'{}'"`
}

type AgentToolCall struct {
	BaseModel
	UserID               string         `json:"userId" gorm:"index;size:36;not null"`
	SessionID            string         `json:"sessionId" gorm:"index;size:36;not null"`
	ToolName             string         `json:"toolName" gorm:"index;size:80;not null"`
	InputJSON            datatypes.JSON `json:"inputJson" gorm:"type:jsonb;not null;default:'{}'"`
	OutputJSON           datatypes.JSON `json:"outputJson" gorm:"type:jsonb;not null;default:'{}'"`
	Status               string         `json:"status" gorm:"index;size:30;not null;default:pending"`
	RequiresConfirmation bool           `json:"requiresConfirmation" gorm:"index;not null;default:true"`
	AppliedAt            *time.Time     `json:"appliedAt" gorm:"index"`
}
