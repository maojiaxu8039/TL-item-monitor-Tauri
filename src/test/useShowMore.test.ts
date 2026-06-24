import { describe, expect, it } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { useShowMore } from "@/hooks/useShowMore"

describe("useShowMore", () => {
  it("starts with initialCount", () => {
    const { result } = renderHook(() => useShowMore(100))
    expect(result.current.visibleCount).toBe(10)
    expect(result.current.hasMore).toBe(true)
    expect(result.current.remaining).toBe(90)
  })

  it("respects custom initialCount and step", () => {
    const { result } = renderHook(() =>
      useShowMore(100, { initialCount: 5, step: 20 }),
    )
    expect(result.current.visibleCount).toBe(5)
    expect(result.current.remaining).toBe(95)
  })

  it("showMore advances by step", () => {
    const { result } = renderHook(() => useShowMore(100))
    act(() => result.current.showMore())
    expect(result.current.visibleCount).toBe(20)
    expect(result.current.remaining).toBe(80)
  })

  it("showMore caps at total", () => {
    const { result } = renderHook(() => useShowMore(15))
    act(() => result.current.showMore())
    expect(result.current.visibleCount).toBe(15)
    expect(result.current.hasMore).toBe(false)
    expect(result.current.remaining).toBe(0)
  })

  it("collapse returns to initialCount", () => {
    const { result } = renderHook(() => useShowMore(100))
    act(() => result.current.showMore())
    act(() => result.current.showMore())
    expect(result.current.visibleCount).toBe(30)
    act(() => result.current.collapse())
    expect(result.current.visibleCount).toBe(10)
  })

  it("reset returns to initialCount", () => {
    const { result } = renderHook(() => useShowMore(100))
    act(() => result.current.showMore())
    act(() => result.current.reset())
    expect(result.current.visibleCount).toBe(10)
  })

  it("hasMore is false when total <= initialCount", () => {
    const { result } = renderHook(() => useShowMore(5))
    expect(result.current.hasMore).toBe(false)
    expect(result.current.remaining).toBe(0)
  })

  it("hasMore is false when total equals initialCount", () => {
    const { result } = renderHook(() => useShowMore(10))
    expect(result.current.hasMore).toBe(false)
    expect(result.current.remaining).toBe(0)
  })

  it("handles total of 0", () => {
    const { result } = renderHook(() => useShowMore(0))
    expect(result.current.visibleCount).toBe(0)
    expect(result.current.hasMore).toBe(false)
    expect(result.current.remaining).toBe(0)
  })

  it("clamps visibleCount when total shrinks below current", () => {
    const { result, rerender } = renderHook(
      ({ total }: { total: number }) => useShowMore(total),
      { initialProps: { total: 100 } },
    )
    expect(result.current.visibleCount).toBe(10)
    act(() => result.current.showMore())
    act(() => result.current.showMore())
    expect(result.current.visibleCount).toBe(30)
    rerender({ total: 5 })
    expect(result.current.visibleCount).toBe(5)
    expect(result.current.hasMore).toBe(false)
  })

  it("showMore clamps to total when step exceeds remaining", () => {
    const { result } = renderHook(() => useShowMore(12))
    act(() => result.current.showMore())
    expect(result.current.visibleCount).toBe(12)
    expect(result.current.hasMore).toBe(false)
  })
})
