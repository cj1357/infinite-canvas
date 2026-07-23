package config

import (
	"testing"
	"time"
)

func TestLoadDefaultsModelGatewayTimeoutToTenMinutes(t *testing.T) {
	t.Setenv("MODEL_GATEWAY_TIMEOUT_SECONDS", "")
	if got := Load().ModelGatewayTimeout; got != 10*time.Minute {
		t.Fatalf("expected model gateway timeout default to be 10 minutes, got %s", got)
	}
}
