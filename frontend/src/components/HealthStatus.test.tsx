import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HealthStatus from "./HealthStatus";

describe("HealthStatus", () => {
  it("loading 状態で読み込み中の表示がされる", () => {
    render(<HealthStatus status="loading" />);
    expect(screen.getByText(/Loading\.\.\./)).toBeInTheDocument();
  });

  it("ok 状態で Backend と DB の正常状態が表示される", () => {
    render(<HealthStatus status="ok" db="connected" />);
    expect(screen.getByText("ok")).toBeInTheDocument();
    expect(screen.getByText("connected")).toBeInTheDocument();
  });

  it("error 状態で DB disconnectedが表示される", () => {
    render(<HealthStatus status="error" db="disconnected" />);
    expect(screen.getByText("error")).toBeInTheDocument();
    expect(screen.getByText("disconnected")).toBeInTheDocument();
  });

  it("error 状態で errorMessage が表示される", () => {
    render(<HealthStatus status="error" errorMessage="Network error" />);
    expect(screen.getByText("error")).toBeInTheDocument();
    expect(screen.getByText("Network error")).toBeInTheDocument();
  });
});
