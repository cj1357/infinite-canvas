package repository

import "infinite-canvas/server/internal/model"

func (r *Repository) GetNewAPIConfig() (model.NewAPIConfig, error) {
	var item model.NewAPIConfig
	err := r.DB.First(&item, "name = ?", "default").Error
	return item, err
}

func (r *Repository) SaveNewAPIConfig(item *model.NewAPIConfig) error {
	if item.Name == "" {
		item.Name = "default"
	}
	return r.DB.Save(item).Error
}
