package service

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"infinite-canvas/server/internal/model"
	"infinite-canvas/server/internal/repository"

	"gorm.io/datatypes"
)

type CreativeAgentService struct {
	repo *repository.Repository
}

type AgentSessionInput struct {
	ProjectID    string         `json:"projectId"`
	Title        string         `json:"title"`
	Locale       string         `json:"locale"`
	MetadataJSON datatypes.JSON `json:"metadataJson"`
}

type AgentCanvasSnapshot struct {
	ProjectID        string            `json:"projectId"`
	Title            string            `json:"title"`
	SelectedNodeIDs  []string          `json:"selectedNodeIds"`
	Nodes            []AgentCanvasNode `json:"nodes"`
	Connections      []map[string]any  `json:"connections"`
	ReferenceSetID   string            `json:"referenceSetId"`
	ReferenceNodeID  string            `json:"referenceNodeId"`
	ExistingIntentID []string          `json:"existingIntentIds"`
}

type AgentCanvasNode struct {
	ID       string         `json:"id"`
	Type     string         `json:"type"`
	Title    string         `json:"title"`
	Metadata map[string]any `json:"metadata"`
}

type AgentMessageInput struct {
	Content        string              `json:"content"`
	CanvasSnapshot AgentCanvasSnapshot `json:"canvasSnapshot"`
	MetadataJSON   datatypes.JSON      `json:"metadataJson"`
}

type AgentMessageResponse struct {
	Session   model.AgentSession    `json:"session"`
	Messages  []model.AgentMessage  `json:"messages"`
	ToolCalls []model.AgentToolCall `json:"toolCalls"`
}

type AgentApplyInput struct {
	OutputJSON datatypes.JSON `json:"outputJson"`
}

func NewCreativeAgentService(repo *repository.Repository) *CreativeAgentService {
	return &CreativeAgentService{repo: repo}
}

func (s *CreativeAgentService) CreateSession(userID string, input AgentSessionInput) (model.AgentSession, error) {
	title := strings.TrimSpace(input.Title)
	if title == "" {
		title = "创作 Agent"
	}
	locale := strings.TrimSpace(input.Locale)
	if locale == "" {
		locale = "zh-CN"
	}
	item := model.AgentSession{
		UserID:       userID,
		ProjectID:    input.ProjectID,
		Title:        title,
		Locale:       locale,
		Status:       "active",
		MetadataJSON: jsonObject(input.MetadataJSON),
	}
	return item, s.repo.SaveAgentSession(&item)
}

func (s *CreativeAgentService) SendMessage(userID string, sessionID string, input AgentMessageInput) (AgentMessageResponse, error) {
	session, err := s.repo.GetAgentSession(userID, sessionID)
	if err != nil {
		return AgentMessageResponse{}, err
	}
	content := strings.TrimSpace(input.Content)
	if content == "" {
		return AgentMessageResponse{}, errors.New("消息不能为空")
	}
	userMessage := model.AgentMessage{
		UserID:       userID,
		SessionID:    session.ID,
		Role:         "user",
		Content:      content,
		MetadataJSON: jsonObject(input.MetadataJSON),
	}
	if err := s.repo.SaveAgentMessage(&userMessage); err != nil {
		return AgentMessageResponse{}, err
	}
	assistantText, calls := s.planToolCalls(userID, session.ID, content, input.CanvasSnapshot)
	assistantMessage := model.AgentMessage{
		UserID:       userID,
		SessionID:    session.ID,
		Role:         "assistant",
		Content:      assistantText,
		MetadataJSON: mustJSON(map[string]any{"toolCallCount": len(calls)}),
	}
	if err := s.repo.SaveAgentMessage(&assistantMessage); err != nil {
		return AgentMessageResponse{}, err
	}
	for index := range calls {
		if err := s.repo.SaveAgentToolCall(&calls[index]); err != nil {
			return AgentMessageResponse{}, err
		}
	}
	session.Title = firstNonEmpty(session.Title, content)
	if err := s.repo.SaveAgentSession(&session); err != nil {
		return AgentMessageResponse{}, err
	}
	messages, err := s.repo.ListAgentMessages(userID, session.ID)
	if err != nil {
		return AgentMessageResponse{}, err
	}
	toolCalls, err := s.repo.ListAgentToolCalls(userID, session.ID)
	if err != nil {
		return AgentMessageResponse{}, err
	}
	return AgentMessageResponse{Session: session, Messages: messages, ToolCalls: toolCalls}, nil
}

func (s *CreativeAgentService) ApplyToolCall(userID string, id string, input AgentApplyInput) (model.AgentToolCall, error) {
	item, err := s.repo.GetAgentToolCall(userID, id)
	if err != nil {
		return item, err
	}
	now := time.Now()
	item.Status = "applied"
	item.AppliedAt = &now
	if len(input.OutputJSON) > 0 {
		item.OutputJSON = jsonObject(input.OutputJSON)
	}
	return item, s.repo.SaveAgentToolCall(&item)
}

func (s *CreativeAgentService) planToolCalls(userID string, sessionID string, content string, snapshot AgentCanvasSnapshot) (string, []model.AgentToolCall) {
	candidates := referenceCandidates(snapshot)
	if len(candidates) > 0 && wantsReferenceHelp(content) {
		intents := make([]map[string]any, 0, len(candidates))
		for index, node := range candidates {
			role := suggestedRole(index, content)
			intents = append(intents, map[string]any{
				"sourceNodeId":   node.ID,
				"title":          node.Title,
				"mediaObjectId":  stringField(node.Metadata, "mediaObjectId"),
				"assetId":        stringField(node.Metadata, "assetId"),
				"role":           role,
				"weight":         suggestedWeight(role),
				"enabled":        true,
				"sortOrder":      index,
				"note":           suggestedNote(role),
				"referenceSetId": snapshot.ReferenceSetID,
			})
		}
		output := map[string]any{
			"summary":          fmt.Sprintf("已为 %d 个可绑定素材生成参考意图建议。", len(intents)),
			"suggestedIntents": intents,
			"referenceSetId":   snapshot.ReferenceSetID,
			"referenceNodeId":  snapshot.ReferenceNodeID,
		}
		return "我整理了一组参考图意图建议，需要你确认后再写入当前 ReferenceSet。", []model.AgentToolCall{{
			UserID:               userID,
			SessionID:            sessionID,
			ToolName:             "suggest_reference_intents",
			InputJSON:            mustJSON(map[string]any{"content": content, "selectedNodeIds": snapshot.SelectedNodeIDs}),
			OutputJSON:           mustJSON(output),
			Status:               "pending",
			RequiresConfirmation: true,
		}}
	}
	output := map[string]any{
		"summary":     fmt.Sprintf("当前画布有 %d 个节点、%d 条连线。", len(snapshot.Nodes), len(snapshot.Connections)),
		"nodeSummary": nodeSummary(snapshot.Nodes),
	}
	return "我先读取了当前画布状态。请选择已绑定云端媒体的节点，或提出要整理参考图组的目标。", []model.AgentToolCall{{
		UserID:               userID,
		SessionID:            sessionID,
		ToolName:             "list_canvas_nodes",
		InputJSON:            mustJSON(map[string]any{"content": content}),
		OutputJSON:           mustJSON(output),
		Status:               "completed",
		RequiresConfirmation: false,
	}}
}

func referenceCandidates(snapshot AgentCanvasSnapshot) []AgentCanvasNode {
	selected := map[string]bool{}
	for _, id := range snapshot.SelectedNodeIDs {
		selected[id] = true
	}
	nodes := snapshot.Nodes
	if len(selected) > 0 {
		nodes = make([]AgentCanvasNode, 0, len(snapshot.Nodes))
		for _, node := range snapshot.Nodes {
			if selected[node.ID] {
				nodes = append(nodes, node)
			}
		}
	}
	result := make([]AgentCanvasNode, 0, len(nodes))
	for _, node := range nodes {
		if stringField(node.Metadata, "mediaObjectId") != "" || stringField(node.Metadata, "assetId") != "" {
			result = append(result, node)
		}
	}
	if len(result) > 6 {
		return result[:6]
	}
	return result
}

func wantsReferenceHelp(content string) bool {
	text := strings.ToLower(content)
	return strings.Contains(text, "参考") || strings.Contains(text, "reference") || strings.Contains(text, "整理") || strings.Contains(text, "风格") || strings.Contains(text, "主体")
}

func suggestedRole(index int, content string) string {
	text := strings.ToLower(content)
	if strings.Contains(text, "风格") || strings.Contains(text, "style") {
		if index == 0 {
			return "style"
		}
	}
	if strings.Contains(text, "构图") || strings.Contains(text, "composition") {
		if index == 0 {
			return "composition"
		}
	}
	switch index {
	case 0:
		return "subject"
	case 1:
		return "style"
	case 2:
		return "composition"
	default:
		return "element"
	}
}

func suggestedWeight(role string) float64 {
	if role == "subject" {
		return 1.2
	}
	if role == "element" {
		return 0.8
	}
	return 1
}

func suggestedNote(role string) string {
	switch role {
	case "style":
		return "提取整体风格、色彩和材质，不强制复制主体。"
	case "composition":
		return "参考画面构图、镜头距离和主体位置。"
	case "element":
		return "只参考局部元素，避免影响整体主体。"
	default:
		return "保持主体身份、轮廓和关键特征一致。"
	}
}

func nodeSummary(nodes []AgentCanvasNode) []map[string]any {
	result := make([]map[string]any, 0, len(nodes))
	for _, node := range nodes {
		result = append(result, map[string]any{"id": node.ID, "type": node.Type, "title": node.Title})
	}
	return result
}

func stringField(record map[string]any, key string) string {
	if record == nil {
		return ""
	}
	value, _ := record[key].(string)
	return value
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			return value
		}
	}
	return ""
}
