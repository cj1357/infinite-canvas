package service

import (
	"context"
	"errors"
	"time"

	"infinite-canvas/server/internal/config"
	"infinite-canvas/server/internal/repository"

	"gorm.io/gorm"
)

type JobWorker struct {
	repo        *repository.Repository
	generation *GenerationService
	concurrency int
	poll        time.Duration
}

func NewJobWorker(repo *repository.Repository, generation *GenerationService, cfg config.Config) *JobWorker {
	concurrency := cfg.WorkerConcurrency
	if concurrency <= 0 {
		concurrency = 1
	}
	pollSeconds := cfg.WorkerPollSeconds
	if pollSeconds <= 0 {
		pollSeconds = 3
	}
	return &JobWorker{repo: repo, generation: generation, concurrency: concurrency, poll: time.Duration(pollSeconds) * time.Second}
}

func (w *JobWorker) Start(ctx context.Context) {
	for i := 0; i < w.concurrency; i++ {
		go w.loop(ctx)
	}
}

func (w *JobWorker) loop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}
		job, err := w.repo.ClaimGenerationJob(time.Now())
		if errors.Is(err, gorm.ErrRecordNotFound) {
			sleepContext(ctx, w.poll)
			continue
		}
		if err != nil {
			sleepContext(ctx, w.poll)
			continue
		}
		if err := w.generation.ExecuteGenerationJob(ctx, job); err != nil {
			now := time.Now()
			job.Status = "failed"
			job.FinishedAt = &now
			job.ErrorMessage = err.Error()
			_ = w.repo.SaveGenerationJob(&job)
		}
	}
}

func sleepContext(ctx context.Context, duration time.Duration) {
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
	case <-timer.C:
	}
}
