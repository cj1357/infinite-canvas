package storage

import (
	"bytes"
	"context"
	"io"
	"mime"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"infinite-canvas/server/internal/config"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type Object struct {
	Body        io.ReadCloser
	ContentType string
	Size        int64
}

type Store interface {
	Put(ctx context.Context, key string, body io.Reader, size int64, contentType string) error
	Get(ctx context.Context, key string) (Object, error)
	Delete(ctx context.Context, key string) error
}

func New(cfg config.StorageConfig) (Store, error) {
	if cfg.Provider == "r2" {
		endpoint, secure := normalizeS3Endpoint(cfg.R2Endpoint)
		client, err := minio.New(endpoint, &minio.Options{
			Creds:  credentials.NewStaticV4(cfg.R2AccessKey, cfg.R2SecretKey, ""),
			Secure: secure,
		})
		if err != nil {
			return nil, err
		}
		return &r2Store{client: client, bucket: cfg.R2Bucket}, nil
	}
	return &localStore{dir: cfg.LocalDir}, nil
}

func normalizeS3Endpoint(endpoint string) (string, bool) {
	value := strings.TrimSpace(endpoint)
	if parsed, err := url.Parse(value); err == nil && parsed.Host != "" {
		return parsed.Host, parsed.Scheme != "http"
	}
	return strings.TrimPrefix(strings.TrimPrefix(value, "https://"), "http://"), true
}

type localStore struct {
	dir string
}

func (s *localStore) Put(ctx context.Context, key string, body io.Reader, size int64, contentType string) error {
	path := filepath.Join(s.dir, filepath.FromSlash(key))
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	file, err := os.Create(path)
	if err != nil {
		return err
	}
	defer file.Close()
	_, err = io.Copy(file, body)
	return err
}

func (s *localStore) Get(ctx context.Context, key string) (Object, error) {
	path := filepath.Join(s.dir, filepath.FromSlash(key))
	file, err := os.Open(path)
	if err != nil {
		return Object{}, err
	}
	stat, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return Object{}, err
	}
	return Object{Body: file, ContentType: mime.TypeByExtension(filepath.Ext(path)), Size: stat.Size()}, nil
}

func (s *localStore) Delete(ctx context.Context, key string) error {
	err := os.Remove(filepath.Join(s.dir, filepath.FromSlash(key)))
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

type r2Store struct {
	client *minio.Client
	bucket string
}

func (s *r2Store) Put(ctx context.Context, key string, body io.Reader, size int64, contentType string) error {
	_, err := s.client.PutObject(ctx, s.bucket, key, body, size, minio.PutObjectOptions{ContentType: contentType})
	return err
}

func (s *r2Store) Get(ctx context.Context, key string) (Object, error) {
	object, err := s.client.GetObject(ctx, s.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return Object{}, err
	}
	stat, err := object.Stat()
	if err != nil {
		_ = object.Close()
		return Object{}, err
	}
	return Object{Body: object, ContentType: stat.ContentType, Size: stat.Size}, nil
}

func (s *r2Store) Delete(ctx context.Context, key string) error {
	return s.client.RemoveObject(ctx, s.bucket, key, minio.RemoveObjectOptions{})
}

func BytesReadCloser(data []byte) io.ReadCloser {
	return io.NopCloser(bytes.NewReader(data))
}
