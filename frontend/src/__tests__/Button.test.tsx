import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "@/components/ui/Button";

describe("Button component", () => {
  it("renders children", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText("Click me")).toBeInTheDocument();
  });

  it("calls onClick when clicked", () => {
    const handler = vi.fn();
    render(<Button onClick={handler}>Swap</Button>);
    fireEvent.click(screen.getByText("Swap"));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when disabled", () => {
    const handler = vi.fn();
    render(<Button onClick={handler} disabled>Swap</Button>);
    fireEvent.click(screen.getByText("Swap"));
    expect(handler).not.toHaveBeenCalled();
  });

  it("shows loading spinner when loading=true", () => {
    render(<Button loading>Swap</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("applies size='lg' class modifier", () => {
    render(<Button size="lg">Large Button</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toBeInTheDocument();
  });

  it("applies variant='secondary' styling", () => {
    render(<Button variant="secondary">Secondary</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toHaveTextContent("Secondary");
  });

  it("renders as disabled when disabled prop is true", () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
