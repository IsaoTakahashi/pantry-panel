// Package apierror defines common API error response types.
package apierror

// ErrorResponse is the standard JSON error body returned by API handlers.
type ErrorResponse struct {
	Message string `json:"message"`
	Detail  string `json:"detail,omitempty"`
}
