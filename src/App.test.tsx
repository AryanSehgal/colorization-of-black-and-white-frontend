// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Blob as NodeBlob } from "node:buffer";
import { unzipSync } from "fflate";
import App from "./App";

// jsdom has no Web Workers. Keep the real ZIP encoder but run it synchronously.
vi.mock("fflate", async (importOriginal) => {
  const original = await importOriginal<typeof import("fflate")>();
  return {
    ...original,
    zip: (
      data: Record<string, Uint8Array>,
      _options: unknown,
      callback: (error: null, data: Uint8Array) => void,
    ) => callback(null, original.zipSync(data)),
  };
});

const requests: string[] = [];
const downloads: { url: string; name: string }[] = [];
const blobs = new Map<string, Blob>();
let rejectFirst = false;
beforeEach(() => {
  requests.length = 0;
  downloads.length = 0;
  blobs.clear();
  rejectFirst = false;
  vi.stubGlobal("Blob", NodeBlob);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      if (path === "/api/health")
        return new Response(JSON.stringify({ ready: true, message: "" }));
      if (path.startsWith("/samples/"))
        return new Response(
          new NodeBlob(["sample-jpeg"], { type: "image/jpeg" }),
        );
      const form = init!.body as FormData;
      requests.push(String(form.get("intensity")));
      if (rejectFirst && requests.length === 1)
        return new Response(JSON.stringify({ detail: "Damaged image" }), {
          status: 422,
        });
      return new Response(new NodeBlob(["png-result"], { type: "image/png" }), {
        headers: {
          "Content-Type": "image/png",
          "X-Image-Width": "100",
          "X-Image-Height": "80",
          "X-Processing-Seconds": "0.2",
        },
      });
    }),
  );
  URL.createObjectURL = vi.fn((blob) => {
    const url = `blob:test-${blobs.size}`;
    blobs.set(url, blob as Blob);
    return url;
  });
  URL.revokeObjectURL = vi.fn(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push({ url: this.href, name: this.download });
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function uploadTwo() {
  render(<App />);
  await screen.findByRole("button", { name: "Model ready" });
  const input = screen.getByLabelText(
    "Upload black and white photos",
  ) as HTMLInputElement;
  await userEvent.upload(input, [
    new File(["one"], "memory.jpg", { type: "image/jpeg" }),
    new File(["two"], "memory.png", { type: "image/png" }),
  ]);
}

describe("colorization workspace", () => {
  it("adds local samples to the regular queue and prevents duplicate additions", async () => {
    render(<App />);
    const portrait = await screen.findByRole("button", {
      name: "Try sample: Portrait",
    });
    await waitFor(() => expect(portrait.hasAttribute("disabled")).toBe(false));
    await userEvent.click(portrait);
    expect(
      screen
        .getByRole("button", { name: "Added: Portrait" })
        .hasAttribute("disabled"),
    ).toBe(true);
    await userEvent.click(
      screen.getByRole("button", { name: "Try sample: Coffee" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Try sample: Rocket" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Colorize 3 photos" }),
    );
    await screen.findByRole("button", { name: "Download all 3" });
    expect(requests).toEqual(["1", "1", "1"]);
  });
  it("processes a batch and downloads a PNG and collision-safe ZIP", async () => {
    await uploadTwo();
    await userEvent.click(
      screen.getByRole("button", { name: "Colorize 2 photos" }),
    );
    await screen.findByRole("button", { name: "Download all 2" });
    expect(requests).toEqual(["1", "1"]);
    await userEvent.click(
      screen.getByRole("button", { name: "Download", exact: true }),
    );
    expect(downloads[0].name).toBe("memory-colorized.png");
    await userEvent.click(
      screen.getByRole("button", { name: "Download all 2" }),
    );
    await waitFor(() => expect(downloads.length).toBe(2));
    expect(downloads[1].name).toBe("chroma-colorized-photos.zip");
    const archive = blobs.get(downloads[1].url)!;
    const entries = unzipSync(new Uint8Array(await archive.arrayBuffer()));
    expect(Object.keys(entries)).toEqual([
      "01-memory-colorized.png",
      "02-memory-colorized.png",
    ]);
    expect(new TextDecoder().decode(entries["01-memory-colorized.png"])).toBe(
      "png-result",
    );
  });
  it("continues after failure and retries only the failed photo with new settings", async () => {
    rejectFirst = true;
    await uploadTwo();
    await userEvent.click(
      screen.getByRole("button", { name: "Colorize 2 photos" }),
    );
    await screen.findByRole("button", { name: "Colorize 1 photo" });
    expect(screen.getByText("Damaged image")).toBeTruthy();
    fireEvent.change(screen.getByRole("slider", { name: /Color intensity/ }), {
      target: { value: "0.5" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Colorize 1 photo" }),
    );
    await screen.findByRole("button", { name: "Download all 2" });
    expect(requests).toEqual(["1", "1", "0.5"]);
  });
  it("releases preview and result URLs when clearing a completed collection", async () => {
    await uploadTwo();
    await userEvent.click(
      screen.getByRole("button", { name: "Colorize 2 photos" }),
    );
    await screen.findByRole("button", { name: "Download all 2" });
    await userEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(
      screen.queryByRole("button", { name: "Preview memory.jpg" }),
    ).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(4);
  });
});
