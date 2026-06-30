package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"mime/multipart"
	"strings"

	"infinite-canvas/server/internal/model"
	"infinite-canvas/server/internal/repository"
	"infinite-canvas/server/internal/storage"

	"github.com/google/uuid"
)

type MediaService struct {
	repo  *repository.Repository
	store storage.Store
}

func NewMediaService(repo *repository.Repository, store storage.Store) *MediaService {
	return &MediaService{repo: repo, store: store}
}

func (s *MediaService) Upload(ctx context.Context, userID string, kind string, header *multipart.FileHeader) (model.MediaObject, error) {
	if header == nil {
		return model.MediaObject{}, errors.New("请选择要上传的文件")
	}
	kind = normalizeMediaKind(kind)
	file, err := header.Open()
	if err != nil {
		return model.MediaObject{}, err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return model.MediaObject{}, err
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return model.MediaObject{}, err
	}
	storageKey := kind + ":" + uuid.NewString()
	objectKey := userID + "/" + storageKey
	contentType := header.Header.Get("Content-Type")
	if err := s.store.Put(ctx, objectKey, file, header.Size, contentType); err != nil {
		return model.MediaObject{}, err
	}
	item := model.MediaObject{
		UserID:      userID,
		StorageKey:  storageKey,
		ObjectKey:   objectKey,
		Kind:        kind,
		ContentType: contentType,
		ByteSize:    header.Size,
		Sha256:      hex.EncodeToString(hash.Sum(nil)),
	}
	return item, s.repo.CreateMediaObject(&item)
}

func (s *MediaService) Get(ctx context.Context, userID string, storageKey string) (model.MediaObject, storage.Object, error) {
	item, err := s.repo.FindMediaObject(userID, storageKey)
	if err != nil {
		return item, storage.Object{}, err
	}
	object, err := s.store.Get(ctx, item.ObjectKey)
	return item, object, err
}

func (s *MediaService) Delete(ctx context.Context, userID string, storageKey string) error {
	item, err := s.repo.FindMediaObject(userID, storageKey)
	if err != nil {
		return err
	}
	if err := s.store.Delete(ctx, item.ObjectKey); err != nil {
		return err
	}
	return s.repo.DeleteMediaObject(userID, storageKey)
}

func normalizeMediaKind(kind string) string {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "video":
		return "video"
	case "audio":
		return "audio"
	default:
		return "image"
	}
}
