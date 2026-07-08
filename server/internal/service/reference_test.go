package service

import (
	"testing"

	"gorm.io/datatypes"
)

func TestValidateReferenceCrop(t *testing.T) {
	tests := []struct {
		name    string
		value   datatypes.JSON
		wantErr bool
	}{
		{name: "empty crop is allowed", value: nil},
		{name: "empty object is allowed", value: datatypes.JSON([]byte(`{}`))},
		{name: "valid rect is allowed", value: datatypes.JSON([]byte(`{"type":"rect","x":0.1,"y":0.2,"width":0.3,"height":0.4}`))},
		{name: "unknown crop type is rejected", value: datatypes.JSON([]byte(`{"type":"circle","x":0.1,"y":0.2,"width":0.3,"height":0.4}`)), wantErr: true},
		{name: "out of range rect is rejected", value: datatypes.JSON([]byte(`{"type":"rect","x":0.8,"y":0.2,"width":0.3,"height":0.4}`)), wantErr: true},
		{name: "tiny rect is rejected", value: datatypes.JSON([]byte(`{"type":"rect","x":0.1,"y":0.2,"width":0.005,"height":0.4}`)), wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateReferenceCrop(tt.value)
			if tt.wantErr && err == nil {
				t.Fatal("expected crop validation to fail")
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("expected crop validation to pass, got %v", err)
			}
		})
	}
}

func TestReferenceCropText(t *testing.T) {
	value := datatypes.JSON([]byte(`{"type":"rect","x":0.12,"y":0.18,"width":0.32,"height":0.41}`))

	got := referenceCropText(value)

	if got != " crop x=0.12 y=0.18 w=0.32 h=0.41" {
		t.Fatalf("unexpected crop text: %q", got)
	}
}
