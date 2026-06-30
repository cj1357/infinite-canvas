package repository

import (
	"infinite-canvas/server/internal/model"
)

func (r *Repository) ListCanvasProjects(userID string, q model.Query) (model.ListResult[model.CanvasProject], error) {
	q.Normalize()
	db := r.DB.Model(&model.CanvasProject{}).Where("user_id = ?", userID)
	if q.Keyword != "" {
		db = db.Where("title ILIKE ?", "%"+q.Keyword+"%")
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return model.ListResult[model.CanvasProject]{}, err
	}
	var items []model.CanvasProject
	err := db.Order("updated_at DESC").Limit(q.PageSize).Offset(q.Offset()).Find(&items).Error
	return model.ListResult[model.CanvasProject]{Items: items, Total: total, Page: q.Page, Size: q.PageSize}, err
}

func (r *Repository) GetCanvasProject(userID string, id string) (model.CanvasProject, error) {
	var item model.CanvasProject
	err := r.DB.First(&item, "id = ? AND user_id = ?", id, userID).Error
	return item, err
}

func (r *Repository) SaveCanvasProject(item *model.CanvasProject) error {
	return r.DB.Save(item).Error
}

func (r *Repository) DeleteCanvasProject(userID string, id string) error {
	return r.DB.Where("id = ? AND user_id = ?", id, userID).Delete(&model.CanvasProject{}).Error
}

func (r *Repository) ListAssets(userID string, q model.Query) (model.ListResult[model.Asset], error) {
	q.Normalize()
	db := r.DB.Model(&model.Asset{}).Where("user_id = ?", userID)
	if q.Keyword != "" {
		db = db.Where("title ILIKE ?", "%"+q.Keyword+"%")
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return model.ListResult[model.Asset]{}, err
	}
	var items []model.Asset
	err := db.Order("updated_at DESC").Limit(q.PageSize).Offset(q.Offset()).Find(&items).Error
	return model.ListResult[model.Asset]{Items: items, Total: total, Page: q.Page, Size: q.PageSize}, err
}

func (r *Repository) GetAsset(userID string, id string) (model.Asset, error) {
	var item model.Asset
	err := r.DB.First(&item, "id = ? AND user_id = ?", id, userID).Error
	return item, err
}

func (r *Repository) SaveAsset(item *model.Asset) error {
	return r.DB.Save(item).Error
}

func (r *Repository) DeleteAsset(userID string, id string) error {
	return r.DB.Where("id = ? AND user_id = ?", id, userID).Delete(&model.Asset{}).Error
}

func (r *Repository) ListGenerationLogs(userID string, q model.Query) (model.ListResult[model.GenerationLog], error) {
	q.Normalize()
	db := r.DB.Model(&model.GenerationLog{}).Where("user_id = ?", userID)
	if q.Keyword != "" {
		db = db.Where("prompt ILIKE ? OR model ILIKE ?", "%"+q.Keyword+"%", "%"+q.Keyword+"%")
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return model.ListResult[model.GenerationLog]{}, err
	}
	var items []model.GenerationLog
	err := db.Order("created_at DESC").Limit(q.PageSize).Offset(q.Offset()).Find(&items).Error
	return model.ListResult[model.GenerationLog]{Items: items, Total: total, Page: q.Page, Size: q.PageSize}, err
}

func (r *Repository) SaveGenerationLog(item *model.GenerationLog) error {
	return r.DB.Save(item).Error
}

func (r *Repository) DeleteGenerationLog(userID string, id string) error {
	return r.DB.Where("id = ? AND user_id = ?", id, userID).Delete(&model.GenerationLog{}).Error
}
