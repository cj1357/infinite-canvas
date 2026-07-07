package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strings"

	"infinite-canvas/server/internal/config"
	"infinite-canvas/server/internal/model"
	"infinite-canvas/server/internal/repository"
	"infinite-canvas/server/internal/storage"

	"github.com/google/uuid"
)

type MediaObjectService struct {
	repo           *repository.Repository
	store          storage.Store
	maxUploadBytes int64
}

func NewMediaObjectService(repo *repository.Repository, store storage.Store, cfg config.StorageConfig) *MediaObjectService {
	return &MediaObjectService{repo: repo, store: store, maxUploadBytes: cfg.MaxUploadBytes}
}

func (s *MediaObjectService) Upload(ctx context.Context, userID string, header *multipart.FileHeader) (model.MediaObject, error) {
	if header == nil {
		return model.MediaObject{}, errors.New("请选择要上传的文件")
	}
	data, err := s.readUpload(header)
	if err != nil {
		return model.MediaObject{}, err
	}
	sum := sha256.Sum256(data)
	sha := hex.EncodeToString(sum[:])
	mimeType := detectMimeType(header, data)
	return s.SaveBytes(ctx, userID, mediaKindFromMime(mimeType), header.Filename, mimeType, data, sha)
}

func (s *MediaObjectService) SaveBytes(ctx context.Context, userID string, kind string, filename string, mimeType string, data []byte, sha string) (model.MediaObject, error) {
	if len(data) == 0 {
		return model.MediaObject{}, errors.New("媒体内容不能为空")
	}
	if sha == "" {
		sum := sha256.Sum256(data)
		sha = hex.EncodeToString(sum[:])
	}
	if mimeType == "" {
		mimeType = http.DetectContentType(data)
	}
	if kind == "" {
		kind = mediaKindFromMime(mimeType)
	}
	mediaID := uuid.NewString()
	objectKey := mediaObjectKey(userID, mediaID, sha, filename, mimeType)
	width, height := imageSize(data)
	item := model.MediaObject{
		BaseModel:   model.BaseModel{ID: mediaID},
		UserID:      userID,
		Kind:        kind,
		StorageKey:  objectKey,
		ObjectKey:   objectKey,
		MimeType:    mimeType,
		ContentType: mimeType,
		ByteSize:    int64(len(data)),
		Width:       width,
		Height:      height,
		Sha256:      sha,
	}
	if err := s.store.Put(ctx, objectKey, bytes.NewReader(data), int64(len(data)), mimeType); err != nil {
		return model.MediaObject{}, err
	}
	if err := s.repo.SaveMediaObject(&item); err != nil {
		_ = s.store.Delete(ctx, objectKey)
		return model.MediaObject{}, err
	}
	return item, nil
}

func (s *MediaObjectService) Open(ctx context.Context, userID string, mediaID string) (storage.Object, model.MediaObject, error) {
	item, err := s.repo.GetMediaObject(userID, mediaID)
	if err != nil {
		return storage.Object{}, item, err
	}
	object, err := s.store.Get(ctx, item.StorageKey)
	if err != nil {
		return storage.Object{}, item, err
	}
	if object.ContentType == "" {
		object.ContentType = firstNonEmpty(item.MimeType, item.ContentType, "application/octet-stream")
	}
	return object, item, nil
}

func (s *MediaObjectService) Delete(ctx context.Context, userID string, mediaID string) error {
	item, err := s.repo.GetMediaObject(userID, mediaID)
	if err != nil {
		return err
	}
	if err := s.store.Delete(ctx, item.StorageKey); err != nil {
		return err
	}
	return s.repo.DeleteMediaObjectByID(userID, mediaID)
}

func (s *MediaObjectService) readUpload(header *multipart.FileHeader) ([]byte, error) {
	if s.maxUploadBytes > 0 && header.Size > s.maxUploadBytes {
		return nil, errors.New("文件超过上传大小限制")
	}
	file, err := header.Open()
	if err != nil {
		return nil, err
	}
	defer file.Close()
	if s.maxUploadBytes <= 0 {
		return io.ReadAll(file)
	}
	data, err := io.ReadAll(io.LimitReader(file, s.maxUploadBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > s.maxUploadBytes {
		return nil, errors.New("文件超过上传大小限制")
	}
	return data, nil
}

func mediaObjectKey(userID string, mediaID string, sha string, filename string, mimeType string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	if ext == "" {
		exts, _ := mime.ExtensionsByType(mimeType)
		if len(exts) > 0 {
			ext = exts[0]
		}
	}
	if ext == "" {
		ext = ".bin"
	}
	return "users/" + userID + "/media/" + mediaID + "/" + sha + ext
}

func detectMimeType(header *multipart.FileHeader, data []byte) string {
	contentType := strings.TrimSpace(header.Header.Get("Content-Type"))
	if contentType != "" && contentType != "application/octet-stream" {
		if value, _, err := mime.ParseMediaType(contentType); err == nil {
			return value
		}
		return contentType
	}
	if len(data) == 0 {
		return "application/octet-stream"
	}
	return http.DetectContentType(data)
}

func mediaKindFromMime(mimeType string) string {
	switch {
	case strings.HasPrefix(mimeType, "video/"):
		return "video"
	case strings.HasPrefix(mimeType, "audio/"):
		return "audio"
	case strings.HasPrefix(mimeType, "image/"):
		return "image"
	default:
		return "file"
	}
}

func imageSize(data []byte) (int, int) {
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return 0, 0
	}
	return cfg.Width, cfg.Height
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
