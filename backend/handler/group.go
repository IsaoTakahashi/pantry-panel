// Package handler implements HTTP handlers for the Pantry Panel API.
package handler

import (
	"errors"
	"net/http"
	"time"

	"github.com/IsaoTakahashi/pantry-panel/backend/apierror"
	"github.com/IsaoTakahashi/pantry-panel/backend/middleware"
	"github.com/IsaoTakahashi/pantry-panel/backend/repository"
	"github.com/google/uuid"
	"github.com/labstack/echo/v5"
)

// GroupHandler handles group management endpoints.
type GroupHandler struct {
	repo repository.GroupRepository
}

// NewGroupHandler creates a new GroupHandler backed by the given repository.
func NewGroupHandler(repo repository.GroupRepository) *GroupHandler {
	return &GroupHandler{repo: repo}
}

// CreateGroupRequest is the request body for creating a group.
type CreateGroupRequest struct {
	Name string `json:"name"`
}

// UpdateGroupRequest is the request body for updating a group name.
type UpdateGroupRequest struct {
	Name string `json:"name"`
}

// CreateGroup handles POST /api/groups.
func (h *GroupHandler) CreateGroup(c *echo.Context) error {
	authInfo, ok := middleware.GetAuthInfo(c)
	if !ok {
		return c.JSON(http.StatusUnauthorized, apierror.ErrorResponse{Message: "Unauthorized"})
	}

	var req CreateGroupRequest
	if err := c.Bind(&req); err != nil || req.Name == "" {
		return c.JSON(http.StatusBadRequest, apierror.ErrorResponse{Message: "name is required"})
	}

	group, err := h.repo.CreateGroup(c.Request().Context(), req.Name, authInfo.UserID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, apierror.ErrorResponse{Message: "Internal Server Error"})
	}
	return c.JSON(http.StatusCreated, group)
}

// GetMyGroups handles GET /api/groups/me.
func (h *GroupHandler) GetMyGroups(c *echo.Context) error {
	authInfo, ok := middleware.GetAuthInfo(c)
	if !ok {
		return c.JSON(http.StatusUnauthorized, apierror.ErrorResponse{Message: "Unauthorized"})
	}

	memberships, err := h.repo.FindMembershipsByUserID(c.Request().Context(), authInfo.UserID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, apierror.ErrorResponse{Message: "Internal Server Error"})
	}
	return c.JSON(http.StatusOK, memberships)
}

// UpdateGroup handles PATCH /api/groups/:id.
func (h *GroupHandler) UpdateGroup(c *echo.Context) error {
	authInfo, ok := middleware.GetAuthInfo(c)
	if !ok {
		return c.JSON(http.StatusUnauthorized, apierror.ErrorResponse{Message: "Unauthorized"})
	}

	groupID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, apierror.ErrorResponse{Message: "Invalid group ID"})
	}

	if groupID != authInfo.GroupID {
		return c.JSON(http.StatusForbidden, apierror.ErrorResponse{Message: "Forbidden"})
	}
	if authInfo.Role != "owner" {
		return c.JSON(http.StatusForbidden, apierror.ErrorResponse{Message: "Forbidden"})
	}

	var req UpdateGroupRequest
	if err := c.Bind(&req); err != nil || req.Name == "" {
		return c.JSON(http.StatusBadRequest, apierror.ErrorResponse{Message: "name is required"})
	}

	group, err := h.repo.UpdateGroupName(c.Request().Context(), groupID, req.Name)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return c.JSON(http.StatusNotFound, apierror.ErrorResponse{Message: "Group not found"})
		}
		return c.JSON(http.StatusInternalServerError, apierror.ErrorResponse{Message: "Internal Server Error"})
	}
	return c.JSON(http.StatusOK, group)
}

// CreateInvitation handles POST /api/invitations.
func (h *GroupHandler) CreateInvitation(c *echo.Context) error {
	authInfo, ok := middleware.GetAuthInfo(c)
	if !ok {
		return c.JSON(http.StatusUnauthorized, apierror.ErrorResponse{Message: "Unauthorized"})
	}
	if authInfo.GroupID == uuid.Nil {
		return c.JSON(http.StatusForbidden, apierror.ErrorResponse{Message: "Not a member of any group"})
	}

	inv, err := h.repo.CreateInvitation(c.Request().Context(),
		authInfo.GroupID, authInfo.UserID, 7*24*time.Hour)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, apierror.ErrorResponse{Message: "Internal Server Error"})
	}
	return c.JSON(http.StatusCreated, inv)
}

// AcceptInvitation handles POST /api/invitations/:token/accept.
func (h *GroupHandler) AcceptInvitation(c *echo.Context) error {
	authInfo, ok := middleware.GetAuthInfo(c)
	if !ok {
		return c.JSON(http.StatusUnauthorized, apierror.ErrorResponse{Message: "Unauthorized"})
	}

	token, err := uuid.Parse(c.Param("token"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, apierror.ErrorResponse{Message: "Invalid token"})
	}

	if err := h.repo.AcceptInvitation(c.Request().Context(), token, authInfo.UserID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return c.JSON(http.StatusNotFound, apierror.ErrorResponse{Message: "Invitation not found"})
		}
		if errors.Is(err, repository.ErrInvitationExpired) {
			return c.JSON(http.StatusGone, apierror.ErrorResponse{Message: "Invitation has expired"})
		}
		return c.JSON(http.StatusInternalServerError, apierror.ErrorResponse{Message: "Internal Server Error"})
	}

	memberships, err := h.repo.FindMembershipsByUserID(c.Request().Context(), authInfo.UserID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, apierror.ErrorResponse{Message: "Internal Server Error"})
	}
	return c.JSON(http.StatusOK, memberships)
}
