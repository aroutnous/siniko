import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App", () => {
  it("affiche le titre SINIKO", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: /SINIKO/i })).toBeTruthy();
  });
});
