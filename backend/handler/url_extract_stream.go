package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/IsaoTakahashi/pantry-panel/backend/apierror"
	"github.com/IsaoTakahashi/pantry-panel/backend/urlextract"
	"github.com/labstack/echo/v5"
)

type progressExtractor interface {
	ExtractWithProgress(ctx context.Context, rawURL string, onProgress urlextract.ProgressFunc) (urlextract.Result, error)
}

// URLExtractStreamHandler handles streaming URL product extraction via SSE.
type URLExtractStreamHandler struct {
	extractor progressExtractor
}

// NewURLExtractStreamHandler creates a new URLExtractStreamHandler backed by the given extractor.
func NewURLExtractStreamHandler(extractor *urlextract.DefaultExtractor) *URLExtractStreamHandler {
	return &URLExtractStreamHandler{extractor: extractor}
}

type sseProgressData struct {
	Step    string `json:"step"`
	Message string `json:"message"`
}

type sseDoneData struct {
	Name           string   `json:"name"`
	ImageURL       *string  `json:"imageUrl"`
	NameCandidates []string `json:"nameCandidates,omitempty"`
}

type sseErrorData struct {
	Kind    string `json:"kind"`
	Message string `json:"message"`
	Detail  string `json:"detail"`
}

func writeSSEEvent(w http.ResponseWriter, event string, data any) error {
	b, err := json.Marshal(data)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, b)
	if err != nil {
		return err
	}
	_ = http.NewResponseController(w).Flush()
	return nil
}

func writeProgressEvent(w http.ResponseWriter, step, message string) error {
	return writeSSEEvent(w, "progress", sseProgressData{Step: step, Message: message})
}

func writeDoneEvent(w http.ResponseWriter, name string, imageURL *string, candidates []string) error {
	return writeSSEEvent(w, "done", sseDoneData{Name: name, ImageURL: imageURL, NameCandidates: candidates})
}

func writeErrorEvent(w http.ResponseWriter, kind, message, detail string) error {
	return writeSSEEvent(w, "error", sseErrorData{Kind: kind, Message: message, Detail: detail})
}

// ExtractStream handles POST /api/extract-from-url/stream, streaming progress via SSE.
func (h *URLExtractStreamHandler) ExtractStream(c *echo.Context) error {
	var req ExtractFromURLRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, apierror.ErrorResponse{Message: "Invalid request body"})
	}
	if req.URL == "" {
		return c.JSON(http.StatusBadRequest, apierror.ErrorResponse{Message: "url is required"})
	}

	slog.Info("extract-from-url/stream", "url", req.URL)

	w := c.Response()
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	result, err := h.extractor.ExtractWithProgress(c.Request().Context(), req.URL, func(step, message string) {
		slog.Info("extract-from-url/stream progress", "step", step)
		_ = writeProgressEvent(w, step, message)
	})

	if err != nil {
		kind := "unknown"
		msg := "Internal Server Error"
		if errors.Is(err, urlextract.ErrFetchFailed) {
			kind = "fetchFailed"
			msg = "failed to fetch the target page"
		} else if errors.Is(err, urlextract.ErrExtractionFailed) {
			kind = "extractionFailed"
			msg = "could not extract product name from page"
		}
		slog.Error("extract-from-url/stream error", "kind", kind, "error", err)
		_ = writeErrorEvent(w, kind, msg, err.Error())
		return nil
	}

	slog.Info("extract-from-url/stream done", "name", result.Name, "hasImage", result.ImageURL != "")
	var imageURL *string
	if result.ImageURL != "" {
		imageURL = &result.ImageURL
	}
	_ = writeDoneEvent(w, result.Name, imageURL, result.NameCandidates)
	return nil
}
