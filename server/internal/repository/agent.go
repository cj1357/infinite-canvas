package repository

import "infinite-canvas/server/internal/model"

func (r *Repository) SaveAgentSession(item *model.AgentSession) error {
	return r.DB.Save(item).Error
}

func (r *Repository) GetAgentSession(userID string, id string) (model.AgentSession, error) {
	var item model.AgentSession
	err := r.DB.First(&item, "id = ? AND user_id = ?", id, userID).Error
	return item, err
}

func (r *Repository) SaveAgentMessage(item *model.AgentMessage) error {
	return r.DB.Save(item).Error
}

func (r *Repository) ListAgentMessages(userID string, sessionID string) ([]model.AgentMessage, error) {
	var items []model.AgentMessage
	err := r.DB.Where("user_id = ? AND session_id = ?", userID, sessionID).Order("created_at ASC").Find(&items).Error
	return items, err
}

func (r *Repository) SaveAgentToolCall(item *model.AgentToolCall) error {
	return r.DB.Save(item).Error
}

func (r *Repository) GetAgentToolCall(userID string, id string) (model.AgentToolCall, error) {
	var item model.AgentToolCall
	err := r.DB.First(&item, "id = ? AND user_id = ?", id, userID).Error
	return item, err
}

func (r *Repository) ListAgentToolCalls(userID string, sessionID string) ([]model.AgentToolCall, error) {
	var items []model.AgentToolCall
	err := r.DB.Where("user_id = ? AND session_id = ?", userID, sessionID).Order("created_at ASC").Find(&items).Error
	return items, err
}
