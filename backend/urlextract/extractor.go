package urlextract

import (
	"context"
	"errors"
)

var ErrFetchFailed = errors.New("urlextract: fetch failed")
var ErrExtractionFailed = errors.New("urlextract: extraction failed")

type Result struct {
	Name     string
	ImageURL string // empty if not found
}

type Extractor interface {
	Extract(ctx context.Context, rawURL string) (Result, error)
}
