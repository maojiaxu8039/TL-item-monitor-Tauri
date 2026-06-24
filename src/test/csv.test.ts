import { describe, it, expect } from "vitest";
import { parseCsv, escapeCsvField, rowsToCsv, findColumnIndex } from "@/lib/csv";

describe("parseCsv", () => {
  it("解析基础 CSV", () => {
    const result = parseCsv("a,b,c\n1,2,3\n");
    expect(result).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("自动剥离 UTF-8 BOM", () => {
    const result = parseCsv("\uFEFF分组,物品\nA组,剑");
    expect(result[0]).toEqual(["分组", "物品"]);
  });

  it("兼容 CRLF 行尾", () => {
    const result = parseCsv("a,b\r\n1,2\r\n3,4");
    expect(result).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("支持双引号包裹的字段", () => {
    const result = parseCsv('"分组,带逗号","物品"\n"A","B"');
    expect(result).toEqual([
      ["分组,带逗号", "物品"],
      ["A", "B"],
    ]);
  });

  it("支持转义双引号 \"\"", () => {
    const result = parseCsv('"包含""引号","ok"');
    expect(result).toEqual([['包含"引号', "ok"]]);
  });

  it("支持字段内的换行", () => {
    const result = parseCsv('"多\n行","ok"');
    expect(result).toEqual([["多\n行", "ok"]]);
  });

  it("跳过完全空白行", () => {
    const result = parseCsv("a,b\n\n1,2\n");
    expect(result).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("escapeCsvField", () => {
  it("纯文本字段不加引号", () => {
    expect(escapeCsvField("abc")).toBe("abc");
  });

  it("含逗号的字段加引号", () => {
    expect(escapeCsvField("a,b")).toBe('"a,b"');
  });

  it("含双引号的字段转义为 \"\" 并加引号", () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it("含换行的字段加引号", () => {
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
  });

  it("null / undefined 序列化为空字符串", () => {
    expect(escapeCsvField(null)).toBe("");
    expect(escapeCsvField(undefined)).toBe("");
  });

  it("数字会被转成字符串", () => {
    expect(escapeCsvField(123)).toBe("123");
  });
});

describe("rowsToCsv", () => {
  it("默认生成带 BOM 的 CRLF CSV", () => {
    const csv = rowsToCsv([
      ["分组", "物品"],
      ["A", "B"],
    ]);
    expect(csv).toBe("\uFEFF分组,物品\r\nA,B\r\n");
  });

  it("可以关闭 BOM 并使用 LF", () => {
    const csv = rowsToCsv(
      [
        ["a", "b"],
        ["1", "2"],
      ],
      { withBom: false, eol: "\n" },
    );
    expect(csv).toBe("a,b\n1,2\n");
  });

  it("序列化能被 parseCsv 还原", () => {
    const rows: string[][] = [
      ["分组", "物品", "备注"],
      ['含,逗号', '含"双引号', "正常"],
    ];
    const csv = rowsToCsv(rows);
    const parsed = parseCsv(csv);
    expect(parsed).toEqual(rows);
  });
});

describe("findColumnIndex", () => {
  const header = ["分组名称", "物品名称", "购买火价", "数量"];

  it("按主键命中", () => {
    expect(findColumnIndex(header, "分组名称")).toBe(0);
  });

  it("按别名命中", () => {
    expect(findColumnIndex(header, "section", "分组名称")).toBe(0);
  });

  it("大小写无关 + trim", () => {
    expect(findColumnIndex(["  Section  ", "Item"], "section")).toBe(0);
  });

  it("找不到时返回 -1", () => {
    expect(findColumnIndex(header, "unknown")).toBe(-1);
  });
});
