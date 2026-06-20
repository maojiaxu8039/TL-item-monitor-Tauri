import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/Surface";

describe("Button Component", () => {
  it("renders with default variant", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: /click me/i })).toBeInTheDocument();
  });

  it("renders with different variants", () => {
    const { rerender } = render(<Button variant="default">Default</Button>);
    expect(screen.getByRole("button")).toBeInTheDocument();

    rerender(<Button variant="outline">Outline</Button>);
    expect(screen.getByRole("button", { name: /outline/i })).toBeInTheDocument();

    rerender(<Button variant="ghost">Ghost</Button>);
    expect(screen.getByRole("button", { name: /ghost/i })).toBeInTheDocument();
  });

  it("handles disabled state", () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });
});

describe("Surface Component", () => {
  it("renders children", () => {
    render(<Surface>Content</Surface>);
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("renders with different padding", () => {
    const { rerender } = render(<Surface padding="none">No Padding</Surface>);
    expect(screen.getByText("No Padding")).toBeInTheDocument();

    rerender(<Surface padding="sm">Small Padding</Surface>);
    expect(screen.getByText("Small Padding")).toBeInTheDocument();

    rerender(<Surface padding="lg">Large Padding</Surface>);
    expect(screen.getByText("Large Padding")).toBeInTheDocument();
  });

  it("renders with custom className", () => {
    render(<Surface className="custom-class">Custom</Surface>);
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });
});
