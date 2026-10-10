import { getConnectivity, markOnline, markOffline, markGrace, inGrace, subscribe } from "../connectivity";

const reset = () => markOnline();

describe("connectivity", () => {
  beforeEach(reset);

  it("arranca online sin caché", () => {
    expect(getConnectivity()).toEqual({ online: true, cached: false, lastFailure: null, graceUntil: null });
  });

  it("markOnline con caché marca servedFromCache", () => {
    markOnline({ servedFromCache: true });
    expect(getConnectivity()).toMatchObject({ online: true, cached: true });
  });

  it("markOffline declara offline con marca de tiempo", () => {
    markOffline();
    const s = getConnectivity();
    expect(s.online).toBe(false);
    expect(s.cached).toBe(true);
    expect(typeof s.lastFailure).toBe("number");
  });

  it("markGrace mantiene online dentro de la ventana", () => {
    markGrace(60_000);
    expect(getConnectivity().online).toBe(true);
    expect(getConnectivity().graceUntil).not.toBeNull();
    expect(inGrace()).toBe(true);
  });

  it("inGrace es false sin ventana o con ventana expirada", () => {
    expect(inGrace()).toBe(false);
    markGrace(-1);
    expect(inGrace()).toBe(false);
  });

  it("subscribe notifica cambios y se puede desuscribir", () => {
    const calls = [];
    const unsub = subscribe((s) => calls.push(s.online));
    markOffline();
    markOnline();
    expect(calls).toEqual([false, true]);
    unsub();
    markOffline();
    expect(calls).toEqual([false, true]);
  });
});
