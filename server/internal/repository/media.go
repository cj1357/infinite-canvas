package repository

import "infinite-canvas/server/internal/model"

func (r *Repository) CreateMediaObject(item *model.MediaObject) error {
	return r.DB.Create(item).Error
}

func (r *Repository) FindMediaObject(userID string, storageKey string) (model.MediaObject, error) {
	var item model.MediaObject
	err := r.DB.First(&item, "user_id = ? AND storage_key = ?", userID, storageKey).Error
	return item, err
}

func (r *Repository) DeleteMediaObject(userID string, storageKey string) error {
	return r.DB.Where("user_id = ? AND storage_key = ?", userID, storageKey).Delete(&model.MediaObject{}).Error
}
