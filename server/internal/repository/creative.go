package repository

import (
	"encoding/json"
	"time"

	"infinite-canvas/server/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func (r *Repository) SaveMediaObject(item *model.MediaObject) error {
	return r.DB.Save(item).Error
}

func (r *Repository) GetMediaObject(userID string, id string) (model.MediaObject, error) {
	var item model.MediaObject
	err := r.DB.First(&item, "id = ? AND user_id = ?", id, userID).Error
	return item, err
}

func (r *Repository) ListMediaObjects(userID string, q model.Query) (model.ListResult[model.MediaObject], error) {
	q.Normalize()
	db := r.DB.Model(&model.MediaObject{}).Where("user_id = ?", userID)
	if q.Keyword != "" {
		kw := "%" + q.Keyword + "%"
		db = db.Where("storage_key ILIKE ? OR kind ILIKE ? OR mime_type ILIKE ? OR sha256 ILIKE ?", kw, kw, kw, kw)
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return model.ListResult[model.MediaObject]{}, err
	}
	var items []model.MediaObject
	err := db.Order("updated_at DESC").Limit(q.PageSize).Offset(q.Offset()).Find(&items).Error
	return model.ListResult[model.MediaObject]{Items: items, Total: total, Page: q.Page, Size: q.PageSize}, err
}

func (r *Repository) DeleteMediaObjectByID(userID string, id string) error {
	return r.DB.Where("id = ? AND user_id = ?", id, userID).Delete(&model.MediaObject{}).Error
}

func (r *Repository) ListCreativeAssets(userID string, q model.Query) (model.ListResult[model.CreativeAsset], error) {
	q.Normalize()
	db := withTags(r.DB.Model(&model.CreativeAsset{}).Where("user_id = ?", userID), q.Tags)
	if q.Keyword != "" {
		kw := "%" + q.Keyword + "%"
		db = db.Where("title ILIKE ? OR description ILIKE ? OR kind ILIKE ?", kw, kw, kw)
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return model.ListResult[model.CreativeAsset]{}, err
	}
	var items []model.CreativeAsset
	err := db.Order("updated_at DESC").Limit(q.PageSize).Offset(q.Offset()).Find(&items).Error
	return model.ListResult[model.CreativeAsset]{Items: items, Total: total, Page: q.Page, Size: q.PageSize}, err
}

func (r *Repository) GetCreativeAsset(userID string, id string) (model.CreativeAsset, error) {
	var item model.CreativeAsset
	err := r.DB.First(&item, "id = ? AND user_id = ?", id, userID).Error
	return item, err
}

func (r *Repository) SaveCreativeAsset(item *model.CreativeAsset) error {
	return r.DB.Save(item).Error
}

func (r *Repository) DeleteCreativeAsset(userID string, id string) error {
	return r.DB.Where("id = ? AND user_id = ?", id, userID).Delete(&model.CreativeAsset{}).Error
}

func (r *Repository) ListReferenceSets(userID string, q model.Query) (model.ListResult[model.ReferenceSet], error) {
	q.Normalize()
	db := r.DB.Model(&model.ReferenceSet{}).Where("user_id = ?", userID)
	if q.Keyword != "" {
		kw := "%" + q.Keyword + "%"
		db = db.Where("title ILIKE ? OR description ILIKE ? OR source ILIKE ?", kw, kw, kw)
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return model.ListResult[model.ReferenceSet]{}, err
	}
	var items []model.ReferenceSet
	err := db.Order("updated_at DESC").Limit(q.PageSize).Offset(q.Offset()).Find(&items).Error
	return model.ListResult[model.ReferenceSet]{Items: items, Total: total, Page: q.Page, Size: q.PageSize}, err
}

func (r *Repository) GetReferenceSet(userID string, id string) (model.ReferenceSet, error) {
	var item model.ReferenceSet
	err := r.DB.First(&item, "id = ? AND user_id = ?", id, userID).Error
	return item, err
}

func (r *Repository) SaveReferenceSet(item *model.ReferenceSet) error {
	return r.DB.Save(item).Error
}

func (r *Repository) DeleteReferenceSet(userID string, id string) error {
	return r.DB.Where("id = ? AND user_id = ?", id, userID).Delete(&model.ReferenceSet{}).Error
}

func (r *Repository) ListReferenceIntents(referenceSetID string) ([]model.ReferenceIntent, error) {
	var items []model.ReferenceIntent
	err := r.DB.Where("reference_set_id = ?", referenceSetID).Order("sort_order ASC, created_at ASC").Find(&items).Error
	return items, err
}

func (r *Repository) ListUserReferenceIntents(userID string, referenceSetID string) ([]model.ReferenceIntent, error) {
	var items []model.ReferenceIntent
	err := r.DB.Where("user_id = ? AND reference_set_id = ?", userID, referenceSetID).Order("sort_order ASC, created_at ASC").Find(&items).Error
	return items, err
}

func (r *Repository) GetReferenceIntent(userID string, id string) (model.ReferenceIntent, error) {
	var item model.ReferenceIntent
	err := r.DB.First(&item, "id = ? AND user_id = ?", id, userID).Error
	return item, err
}

func (r *Repository) SaveReferenceIntent(item *model.ReferenceIntent) error {
	return r.DB.Save(item).Error
}

func (r *Repository) DeleteReferenceIntent(userID string, id string) error {
	return r.DB.Where("id = ? AND user_id = ?", id, userID).Delete(&model.ReferenceIntent{}).Error
}

func (r *Repository) ListGenerationRuns(userID string, q model.Query) (model.ListResult[model.GenerationRun], error) {
	q.Normalize()
	db := r.DB.Model(&model.GenerationRun{}).Where("user_id = ?", userID)
	db = filterGenerationRuns(db, q.Keyword)
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return model.ListResult[model.GenerationRun]{}, err
	}
	var items []model.GenerationRun
	err := db.Order("created_at DESC").Limit(q.PageSize).Offset(q.Offset()).Find(&items).Error
	return model.ListResult[model.GenerationRun]{Items: items, Total: total, Page: q.Page, Size: q.PageSize}, err
}

func (r *Repository) AdminListGenerationRuns(q model.Query) (model.ListResult[model.GenerationRun], error) {
	q.Normalize()
	db := filterGenerationRuns(r.DB.Model(&model.GenerationRun{}), q.Keyword)
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return model.ListResult[model.GenerationRun]{}, err
	}
	var items []model.GenerationRun
	err := db.Order("created_at DESC").Limit(q.PageSize).Offset(q.Offset()).Find(&items).Error
	return model.ListResult[model.GenerationRun]{Items: items, Total: total, Page: q.Page, Size: q.PageSize}, err
}

func (r *Repository) GetGenerationRun(userID string, id string) (model.GenerationRun, error) {
	var item model.GenerationRun
	err := r.DB.First(&item, "id = ? AND user_id = ?", id, userID).Error
	return item, err
}

func (r *Repository) AdminGetGenerationRun(id string) (model.GenerationRun, error) {
	var item model.GenerationRun
	err := r.DB.First(&item, "id = ?", id).Error
	return item, err
}

func (r *Repository) SaveGenerationRun(item *model.GenerationRun) error {
	return r.DB.Save(item).Error
}

func (r *Repository) ListGenerationOutputs(userID string, generationRunID string) ([]model.GenerationOutput, error) {
	var items []model.GenerationOutput
	err := r.DB.Where("user_id = ? AND generation_run_id = ?", userID, generationRunID).Order("created_at ASC").Find(&items).Error
	return items, err
}

func (r *Repository) GetGenerationOutput(userID string, id string) (model.GenerationOutput, error) {
	var item model.GenerationOutput
	err := r.DB.First(&item, "id = ? AND user_id = ?", id, userID).Error
	return item, err
}

func (r *Repository) SaveGenerationOutput(item *model.GenerationOutput) error {
	return r.DB.Save(item).Error
}

func (r *Repository) DeleteGenerationOutput(userID string, id string) error {
	return r.DB.Where("id = ? AND user_id = ?", id, userID).Delete(&model.GenerationOutput{}).Error
}

func (r *Repository) ListGenerationJobs(userID string, q model.Query) (model.ListResult[model.GenerationJob], error) {
	q.Normalize()
	db := filterGenerationJobs(r.DB.Model(&model.GenerationJob{}).Where("user_id = ?", userID), q.Keyword)
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return model.ListResult[model.GenerationJob]{}, err
	}
	var items []model.GenerationJob
	err := db.Order("created_at DESC").Limit(q.PageSize).Offset(q.Offset()).Find(&items).Error
	return model.ListResult[model.GenerationJob]{Items: items, Total: total, Page: q.Page, Size: q.PageSize}, err
}

func (r *Repository) AdminListGenerationJobs(q model.Query) (model.ListResult[model.GenerationJob], error) {
	q.Normalize()
	db := filterGenerationJobs(r.DB.Model(&model.GenerationJob{}), q.Keyword)
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return model.ListResult[model.GenerationJob]{}, err
	}
	var items []model.GenerationJob
	err := db.Order("created_at DESC").Limit(q.PageSize).Offset(q.Offset()).Find(&items).Error
	return model.ListResult[model.GenerationJob]{Items: items, Total: total, Page: q.Page, Size: q.PageSize}, err
}

func (r *Repository) GetGenerationJob(userID string, id string) (model.GenerationJob, error) {
	var item model.GenerationJob
	err := r.DB.First(&item, "id = ? AND user_id = ?", id, userID).Error
	return item, err
}

func (r *Repository) GetLatestGenerationJobByRun(userID string, generationRunID string) (model.GenerationJob, error) {
	var item model.GenerationJob
	err := r.DB.Where("user_id = ? AND generation_run_id = ?", userID, generationRunID).Order("created_at DESC").First(&item).Error
	return item, err
}

func (r *Repository) AdminGetGenerationJob(id string) (model.GenerationJob, error) {
	var item model.GenerationJob
	err := r.DB.First(&item, "id = ?", id).Error
	return item, err
}

func (r *Repository) SaveGenerationJob(item *model.GenerationJob) error {
	return r.DB.Save(item).Error
}

func (r *Repository) ClaimGenerationJob(now time.Time) (model.GenerationJob, error) {
	var job model.GenerationJob
	err := r.DB.Transaction(func(tx *gorm.DB) error {
		err := tx.Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"}).
			Where("status IN ? AND (next_retry_at IS NULL OR next_retry_at <= ?)", []string{"queued", "retrying"}, now).
			Order("priority DESC, created_at ASC").
			First(&job).Error
		if err != nil {
			return err
		}
		job.Status = "running"
		job.LockedAt = &now
		job.StartedAt = &now
		job.Attempt++
		return tx.Save(&job).Error
	})
	return job, err
}

func (r *Repository) ListModelCapabilities(q model.Query) (model.ListResult[model.ModelCapability], error) {
	q.Normalize()
	db := r.DB.Model(&model.ModelCapability{})
	if q.Keyword != "" {
		kw := "%" + q.Keyword + "%"
		db = db.Where("model ILIKE ? OR ability ILIKE ? OR model_family ILIKE ?", kw, kw, kw)
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return model.ListResult[model.ModelCapability]{}, err
	}
	var items []model.ModelCapability
	err := db.Order("ability ASC, model ASC").Limit(q.PageSize).Offset(q.Offset()).Find(&items).Error
	return model.ListResult[model.ModelCapability]{Items: items, Total: total, Page: q.Page, Size: q.PageSize}, err
}

func (r *Repository) FindModelCapability(modelName string, ability string) (model.ModelCapability, error) {
	var item model.ModelCapability
	err := r.DB.First(&item, "model = ? AND ability = ? AND enabled = ?", modelName, ability, true).Error
	return item, err
}

func (r *Repository) GetModelCapability(id string) (model.ModelCapability, error) {
	var item model.ModelCapability
	err := r.DB.First(&item, "id = ?", id).Error
	return item, err
}

func (r *Repository) SaveModelCapability(item *model.ModelCapability) error {
	return r.DB.Save(item).Error
}

func (r *Repository) DeleteModelCapability(id string) error {
	return r.DB.Delete(&model.ModelCapability{}, "id = ?", id).Error
}

func (r *Repository) ListPromptTemplates(q model.Query) (model.ListResult[model.PromptTemplate], error) {
	q.Normalize()
	db := r.DB.Model(&model.PromptTemplate{})
	if q.Keyword != "" {
		kw := "%" + q.Keyword + "%"
		db = db.Where("locale ILIKE ? OR template_key ILIKE ? OR ability ILIKE ? OR model_family ILIKE ? OR title ILIKE ?", kw, kw, kw, kw, kw)
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return model.ListResult[model.PromptTemplate]{}, err
	}
	var items []model.PromptTemplate
	err := db.Order("locale ASC, ability ASC, model_family ASC, template_key ASC, version DESC").Limit(q.PageSize).Offset(q.Offset()).Find(&items).Error
	return model.ListResult[model.PromptTemplate]{Items: items, Total: total, Page: q.Page, Size: q.PageSize}, err
}

func (r *Repository) FindPromptTemplate(locale string, ability string, modelFamily string, templateKey string) (model.PromptTemplate, error) {
	var item model.PromptTemplate
	err := r.DB.Where("locale = ? AND ability = ? AND model_family = ? AND template_key = ? AND enabled = ?", locale, ability, modelFamily, templateKey, true).
		Order("version DESC").
		First(&item).Error
	return item, err
}

func (r *Repository) GetPromptTemplate(id string) (model.PromptTemplate, error) {
	var item model.PromptTemplate
	err := r.DB.First(&item, "id = ?", id).Error
	return item, err
}

func (r *Repository) SavePromptTemplate(item *model.PromptTemplate) error {
	return r.DB.Save(item).Error
}

func (r *Repository) DeletePromptTemplate(id string) error {
	return r.DB.Delete(&model.PromptTemplate{}, "id = ?", id).Error
}

func withTags(db *gorm.DB, tags []string) *gorm.DB {
	for _, tag := range tags {
		if tag == "" {
			continue
		}
		raw, _ := json.Marshal([]string{tag})
		db = db.Where("tags_json @> ?::jsonb", string(raw))
	}
	return db
}

func filterGenerationRuns(db *gorm.DB, keyword string) *gorm.DB {
	if keyword == "" {
		return db
	}
	kw := "%" + keyword + "%"
	return db.Where("prompt ILIKE ? OR model ILIKE ? OR ability ILIKE ? OR status ILIKE ?", kw, kw, kw, kw)
}

func filterGenerationJobs(db *gorm.DB, keyword string) *gorm.DB {
	if keyword == "" {
		return db
	}
	kw := "%" + keyword + "%"
	return db.Where("ability ILIKE ? OR status ILIKE ? OR error_key ILIKE ? OR error_code ILIKE ?", kw, kw, kw, kw)
}
