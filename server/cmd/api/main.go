package main

import (
	"log"

	"infinite-canvas/server/internal/config"
	"infinite-canvas/server/internal/repository"
	"infinite-canvas/server/internal/router"
	"infinite-canvas/server/internal/storage"
)

func main() {
	cfg := config.Load()
	db, err := repository.Open(cfg)
	if err != nil {
		log.Fatal(err)
	}
	if err := repository.AutoMigrate(db); err != nil {
		log.Fatal(err)
	}
	store, err := storage.New(cfg.Storage)
	if err != nil {
		log.Fatal(err)
	}
	app := router.New(repository.New(db), store, cfg)
	if err := app.Run(cfg.Addr); err != nil {
		log.Fatal(err)
	}
}
