package repository

import (
	"time"

	"infinite-canvas/server/internal/model"

	"gorm.io/gorm"
)

func (r *Repository) WithTx(tx *gorm.DB) *Repository {
	return &Repository{DB: tx}
}

func (r *Repository) CountUsers() (int64, error) {
	var total int64
	err := r.DB.Model(&model.User{}).Count(&total).Error
	return total, err
}

func (r *Repository) CreateUser(user *model.User) error {
	return r.DB.Create(user).Error
}

func (r *Repository) FindUserByID(id string) (model.User, error) {
	var user model.User
	err := r.DB.First(&user, "id = ?", id).Error
	return user, err
}

func (r *Repository) FindUserByEmail(email string) (model.User, error) {
	var user model.User
	err := r.DB.First(&user, "email = ?", email).Error
	return user, err
}

func (r *Repository) UpdateUser(user *model.User) error {
	return r.DB.Save(user).Error
}

func (r *Repository) TouchUserLogin(id string, t time.Time) error {
	return r.DB.Model(&model.User{}).Where("id = ?", id).Update("last_login_at", t).Error
}

func (r *Repository) ListUsers(q model.Query) (model.ListResult[model.User], error) {
	q.Normalize()
	db := r.DB.Model(&model.User{})
	if q.Keyword != "" {
		like := "%" + q.Keyword + "%"
		db = db.Where("email ILIKE ? OR username ILIKE ? OR display_name ILIKE ?", like, like, like)
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return model.ListResult[model.User]{}, err
	}
	var items []model.User
	err := db.Order("created_at DESC").Limit(q.PageSize).Offset(q.Offset()).Find(&items).Error
	return model.ListResult[model.User]{Items: items, Total: total, Page: q.Page, Size: q.PageSize}, err
}
