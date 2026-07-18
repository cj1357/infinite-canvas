package router

import (
	"context"
	"net/http"

	"infinite-canvas/server/internal/config"
	"infinite-canvas/server/internal/handler"
	"infinite-canvas/server/internal/httpx"
	"infinite-canvas/server/internal/middleware"
	"infinite-canvas/server/internal/repository"
	"infinite-canvas/server/internal/service"
	"infinite-canvas/server/internal/storage"

	"github.com/gin-gonic/gin"
)

func New(repo *repository.Repository, store storage.Store, cfg config.Config) *gin.Engine {
	if cfg.AppEnv == "production" {
		gin.SetMode(gin.ReleaseMode)
	}
	r := gin.Default()
	r.Use(cors(cfg))

	authService := service.NewAuthService(repo, cfg)
	billingService := service.NewBillingService(repo)
	dataService := service.NewDataService(repo)
	mediaService := service.NewMediaObjectService(repo, store, cfg.Storage)
	referenceService := service.NewReferenceService(repo)
	creativeAssetService := service.NewCreativeAssetService(repo)
	creativeAgentService := service.NewCreativeAgentService(repo)
	gatewayService := service.NewModelGatewayService(repo, cfg)
	generationService := service.NewGenerationService(repo, billingService, referenceService, gatewayService, mediaService)
	promptTemplateService := service.NewPromptTemplateService(repo)
	adminService := service.NewAdminService(repo, gatewayService, promptTemplateService, generationService, billingService)
	if cfg.WorkerEnabled {
		service.NewJobWorker(repo, generationService, cfg).Start(context.Background())
	}

	authHandler := handler.NewAuthHandler(authService, cfg)
	dataHandler := handler.NewDataHandler(dataService)
	mediaHandler := handler.NewMediaHandler(mediaService)
	creativeHandler := handler.NewCreativeHandler(referenceService, generationService, creativeAssetService)
	agentHandler := handler.NewAgentHandler(creativeAgentService)
	billingHandler := handler.NewBillingHandler(billingService)
	adminHandler := handler.NewAdminHandler(adminService)
	aiHandler := handler.NewAIHandler(billingService, gatewayService)
	authMiddleware := middleware.NewAuthMiddleware(authService, cfg.CookieName)

	api := r.Group("/api/server")
	api.GET("/health", func(c *gin.Context) {
		httpx.OK(c, gin.H{"status": "ok"})
	})

	auth := api.Group("/auth")
	auth.POST("/register", authHandler.Register)
	auth.POST("/login", authHandler.Login)
	auth.POST("/logout", authHandler.Logout)
	auth.GET("/me", authMiddleware.Required(), authHandler.Me)

	protected := api.Group("")
	protected.Use(authMiddleware.Required())
	protected.GET("/billing/me", billingHandler.Me)
	protected.POST("/billing/estimate", billingHandler.Estimate)
	protected.GET("/usage-requests", billingHandler.ListUsage)
	protected.GET("/credit-ledger", billingHandler.ListLedger)

	protected.GET("/canvas-projects", dataHandler.ListCanvasProjects)
	protected.POST("/canvas-projects", dataHandler.CreateCanvasProject)
	protected.PATCH("/canvas-projects/:id", dataHandler.UpdateCanvasProject)
	protected.DELETE("/canvas-projects/:id", dataHandler.DeleteCanvasProject)
	protected.GET("/assets", dataHandler.ListAssets)
	protected.POST("/assets", dataHandler.CreateAsset)
	protected.PATCH("/assets/:id", dataHandler.UpdateAsset)
	protected.DELETE("/assets/:id", dataHandler.DeleteAsset)
	protected.GET("/generation-logs", dataHandler.ListGenerationLogs)
	protected.POST("/generation-logs", dataHandler.CreateGenerationLog)
	protected.DELETE("/generation-logs/:id", dataHandler.DeleteGenerationLog)
	protected.POST("/import/local-data", dataHandler.ImportLocalData)

	protected.POST("/media/upload", mediaHandler.Upload)
	protected.GET("/media/:id", mediaHandler.Get)
	protected.DELETE("/media/:id", mediaHandler.Delete)

	protected.GET("/reference-sets", creativeHandler.ListReferenceSets)
	protected.POST("/reference-sets", creativeHandler.CreateReferenceSet)
	protected.GET("/reference-sets/:id", creativeHandler.GetReferenceSet)
	protected.PATCH("/reference-sets/:id", creativeHandler.UpdateReferenceSet)
	protected.POST("/reference-sets/:id/intents", creativeHandler.CreateReferenceIntent)
	protected.POST("/reference-sets/:id/compile-preview", creativeHandler.CompileReferenceSetPreview)
	protected.PATCH("/reference-intents/:id", creativeHandler.UpdateReferenceIntent)
	protected.DELETE("/reference-intents/:id", creativeHandler.DeleteReferenceIntent)
	protected.GET("/creative-assets", creativeHandler.ListCreativeAssets)
	protected.POST("/creative-assets", creativeHandler.CreateCreativeAsset)
	protected.PATCH("/creative-assets/:id", creativeHandler.UpdateCreativeAsset)
	protected.DELETE("/creative-assets/:id", creativeHandler.DeleteCreativeAsset)
	protected.POST("/generation-runs", creativeHandler.CreateGenerationRun)
	protected.GET("/generation-runs/:id", creativeHandler.GetGenerationRun)
	protected.GET("/generation-runs/:id/detail", creativeHandler.GetGenerationRunDetail)
	protected.GET("/generation-jobs/:id", creativeHandler.GetGenerationJob)
	protected.POST("/generation-outputs/:id/save-asset", creativeHandler.SaveGenerationOutputAsAsset)
	protected.POST("/generation-runs/:id/retry", creativeHandler.RetryGenerationRun)
	protected.POST("/generation-runs/:id/cancel", creativeHandler.CancelGenerationRun)
	protected.POST("/agent/sessions", agentHandler.CreateSession)
	protected.POST("/agent/sessions/:id/messages", agentHandler.SendMessage)
	protected.POST("/agent/tool-calls/:id/apply", agentHandler.ApplyToolCall)

	protected.POST("/ai/images/generations", aiHandler.ProxyPost("image_generation", "/images/generations"))
	protected.POST("/ai/images/edits", aiHandler.ProxyPost("image_edit", "/images/edits"))
	protected.POST("/ai/responses", aiHandler.ProxyPost("text_response", "/responses"))
	protected.POST("/ai/audio/speech", aiHandler.ProxyPost("audio_speech", "/audio/speech"))
	// protected.POST("/ai/videos", aiHandler.ProxyPost("video", "/videos"))
	// protected.GET("/ai/videos/:id/content", aiHandler.ProxyGetWithSuffix("/videos", "/content"))
	// protected.GET("/ai/videos/:id", aiHandler.ProxyGet("/videos"))

	admin := api.Group("/admin")
	admin.Use(authMiddleware.Required(), authMiddleware.AdminRequired())
	admin.GET("/users", adminHandler.ListUsers)
	admin.POST("/users/:id/grant-entitlement", billingHandler.GrantEntitlement)
	admin.POST("/users/:id/adjust-credits", billingHandler.AdjustCredits)
	admin.POST("/users/:id/reset-period", billingHandler.ResetPeriod)
	admin.POST("/users/:id/reset-five-hour-window", billingHandler.ResetFiveHourWindow)
	admin.GET("/model-rate-rules", billingHandler.ListRateRules)
	admin.POST("/model-rate-rules", billingHandler.CreateRateRule)
	admin.PATCH("/model-rate-rules/:id", billingHandler.UpdateRateRule)
	admin.GET("/model-capabilities", adminHandler.ListModelCapabilities)
	admin.POST("/model-capabilities", adminHandler.CreateModelCapability)
	admin.PATCH("/model-capabilities/:id", adminHandler.UpdateModelCapability)
	admin.GET("/prompt-templates", adminHandler.ListPromptTemplates)
	admin.POST("/prompt-templates", adminHandler.CreatePromptTemplate)
	admin.PATCH("/prompt-templates/:id", adminHandler.UpdatePromptTemplate)
	admin.POST("/prompt-templates/preview", adminHandler.PreviewPromptTemplate)
	admin.GET("/generation-runs", adminHandler.ListGenerationRuns)
	admin.GET("/generation-jobs", adminHandler.ListGenerationJobs)
	admin.POST("/generation-runs/:id/retry", adminHandler.RetryGenerationRun)
	admin.POST("/generation-runs/:id/refund", adminHandler.RefundGenerationRun)
	admin.GET("/model-gateway", adminHandler.GetModelGateway)
	admin.PATCH("/model-gateway", adminHandler.SaveModelGateway)
	admin.POST("/model-gateway/test", adminHandler.TestModelGateway)

	return r
}

func cors(cfg config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" && allowOrigin(origin, cfg.CORSOrigins) {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Allow-Credentials", "true")
			c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
			c.Header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		}
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

func allowOrigin(origin string, origins []string) bool {
	if len(origins) == 0 {
		return false
	}
	for _, item := range origins {
		if item == "*" || item == origin {
			return true
		}
	}
	return false
}
