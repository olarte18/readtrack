import {
  modeLabel,
  modeUnit,
  formatPoint,
  deltaLabel,
  completionBound,
  isCompleted,
  progressFraction,
  pagesEquivalent,
  pagesLeftEquivalent,
} from "../progress";

describe("modeLabel / modeUnit", () => {
  it("asume modo página cuando falta reading_mode", () => {
    expect(modeLabel()).toBe("página");
    expect(modeLabel({})).toBe("página");
    expect(modeUnit({})).toBe("págs");
  });

  it("traduce los tres modos", () => {
    expect(modeLabel({ reading_mode: "percentage" })).toBe("porcentaje");
    expect(modeLabel({ reading_mode: "chapter" })).toBe("capítulo");
    expect(modeUnit({ reading_mode: "percentage" })).toBe("%");
    expect(modeUnit({ reading_mode: "chapter" })).toBe("cap.");
  });
});

describe("formatPoint", () => {
  it("formatea según el modo", () => {
    expect(formatPoint({ reading_mode: "percentage" }, 42)).toBe("42%");
    expect(formatPoint({ reading_mode: "chapter" }, 3)).toBe("Capítulo 3");
    expect(formatPoint({ reading_mode: "page" }, 12)).toBe("Página 12");
  });

  it("cae a current_page o 0 si no hay valor", () => {
    expect(formatPoint({ reading_mode: "page", current_page: 7 })).toBe("Página 7");
    expect(formatPoint({})).toBe("Página 0");
  });
});

describe("deltaLabel", () => {
  it("concuerda singular/plural en página", () => {
    expect(deltaLabel({ reading_mode: "page" }, 1)).toBe("1 página");
    expect(deltaLabel({ reading_mode: "page" }, 5)).toBe("5 páginas");
  });

  it("concuerda singular/plural en capítulo", () => {
    expect(deltaLabel({ reading_mode: "chapter" }, 1)).toBe("1 capítulo");
    expect(deltaLabel({ reading_mode: "chapter" }, 2)).toBe("2 capítulos");
  });

  it("porcentaje y valores negativos", () => {
    expect(deltaLabel({ reading_mode: "percentage" }, 20)).toBe("20%");
    expect(deltaLabel({ reading_mode: "page" }, -3)).toBe("0 páginas");
  });
});

describe("completionBound / isCompleted", () => {
  it("deriva el límite por modo", () => {
    expect(completionBound({ pages: 300 })).toBe(300);
    expect(completionBound({ reading_mode: "percentage" })).toBe(100);
    expect(completionBound({ reading_mode: "chapter", chapters: 20 })).toBe(20);
    expect(completionBound({})).toBeNull();
  });

  it("completa al alcanzar el límite y nunca sin límite", () => {
    expect(isCompleted({ pages: 100 }, 100)).toBe(true);
    expect(isCompleted({ pages: 100 }, 99)).toBe(false);
    expect(isCompleted({ reading_mode: "percentage" }, 100)).toBe(true);
    expect(isCompleted({}, 5)).toBe(false);
  });
});

describe("progressFraction", () => {
  it("calcula la fracción y la acota a 1", () => {
    expect(progressFraction({ pages: 200, current_page: 50 })).toBe(0.25);
    expect(progressFraction({ pages: 200 }, 300)).toBe(1);
    expect(progressFraction({ reading_mode: "percentage" }, 25)).toBe(0.25);
  });

  it("devuelve null sin límite", () => {
    expect(progressFraction({}, 5)).toBeNull();
  });
});

describe("pagesEquivalent", () => {
  it("modo página usa el delta directo (mínimo 0)", () => {
    expect(pagesEquivalent({ reading_mode: "page" }, 30, 10)).toBe(20);
    expect(pagesEquivalent({ reading_mode: "page" }, 5, 10)).toBe(0);
  });

  it("porcentaje y capítulo escalan por páginas totales", () => {
    expect(pagesEquivalent({ reading_mode: "percentage", pages: 300 }, 50, 0)).toBe(150);
    expect(pagesEquivalent({ reading_mode: "chapter", pages: 300, chapters: 15 }, 3, 0)).toBe(60);
  });

  it("devuelve 0 si faltan páginas o capítulos", () => {
    expect(pagesEquivalent({ reading_mode: "percentage" }, 50, 0)).toBe(0);
    expect(pagesEquivalent({ reading_mode: "chapter", pages: 300 }, 3, 0)).toBe(0);
  });
});

describe("pagesLeftEquivalent", () => {
  it("calcula páginas restantes redondeadas", () => {
    expect(pagesLeftEquivalent({ pages: 200 }, 50)).toBe(150);
    expect(pagesLeftEquivalent({ reading_mode: "percentage", pages: 100 }, 40)).toBe(60);
  });

  it("devuelve null sin páginas o sin límite", () => {
    expect(pagesLeftEquivalent({}, 5)).toBeNull();
    expect(pagesLeftEquivalent({ pages: 100 }, 250)).toBe(0);
  });
});
