package model

import "gorm.io/datatypes"

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
	UserID      string `json:"userId" gorm:"index;size:36;not null"`
	StorageKey  string `json:"storageKey" gorm:"uniqueIndex;size:160;not null"`
	ObjectKey   string `json:"objectKey" gorm:"size:260;not null"`
	Kind        string `json:"kind" gorm:"index;size:30;not null"`
	ContentType string `json:"contentType" gorm:"size:120"`
	ByteSize    int64  `json:"byteSize"`
	Sha256      string `json:"sha256" gorm:"size:64"`
}
