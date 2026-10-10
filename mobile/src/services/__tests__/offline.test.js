import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  enqueue,
  getPending,
  flushQueue,
  getFailed,
  discardFailed,
  requeueFailed,
  clearPendingQueue,
} from "../offline";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("../secureStorage", () => ({ getUserId: async () => "7" }));
jest.mock("../api", () => ({ isNetworkError: (e) => !!(e && e.network) }));

const ok = async () => {};
const netErr = async () => {
  throw { network: true };
};
const permErr = async () => {
  throw { status: 400 };
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("offline queue", () => {
  it("encola con clientId y attempts en cero", async () => {
    await enqueue({ payload: { session: { page: 1 } } });
    const queue = await getPending();
    expect(queue).toHaveLength(1);
    expect(queue[0].clientId).toBeTruthy();
    expect(queue[0].attempts).toBe(0);
  });

  it("flush exitoso borra el item", async () => {
    await enqueue({ payload: {} });
    const res = await flushQueue(ok);
    expect(res).toMatchObject({ synced: 1, remaining: 0, failed: 0 });
    expect(await getPending()).toHaveLength(0);
  });

  it("error de red detiene el flush y conserva el item", async () => {
    await enqueue({ payload: {} });
    const res = await flushQueue(netErr);
    expect(res).toMatchObject({ synced: 0, remaining: 1, failed: 0 });
    expect((await getPending())[0].attempts).toBe(0);
  });

  it("error permanente acumula intentos antes del umbral", async () => {
    await enqueue({ payload: {} });
    await flushQueue(permErr);
    expect((await getPending())[0].attempts).toBe(1);
    expect(await getFailed()).toHaveLength(0);
  });

  it("mueve a la zona muerta al agotar los intentos (no borra)", async () => {
    await enqueue({ payload: {} });
    for (let i = 0; i < 5; i += 1) await flushQueue(permErr);
    expect(await getPending()).toHaveLength(0);
    const failed = await getFailed();
    expect(failed).toHaveLength(1);
    expect(failed[0].clientId).toBeTruthy();
    expect(failed[0].failedAt).toBeTruthy();
  });

  it("no bloquea la cola: sigue con el siguiente item tras mover uno", async () => {
    await enqueue({ payload: { bad: true } });
    for (let i = 0; i < 4; i += 1) await flushQueue(permErr);
    await enqueue({ payload: { bad: false } });
    const submit = async (id, clientId, payload) => {
      if (payload.bad) throw { status: 400 };
    };
    const res = await flushQueue(submit);
    expect(res).toMatchObject({ synced: 1, remaining: 0, failed: 1 });
    expect(await getFailed()).toHaveLength(1);
  });

  it("requeueFailed devuelve los items a la cola con intentos en cero", async () => {
    await enqueue({ payload: {} });
    for (let i = 0; i < 5; i += 1) await flushQueue(permErr);
    const n = await requeueFailed();
    expect(n).toBe(1);
    expect(await getFailed()).toHaveLength(0);
    const queue = await getPending();
    expect(queue).toHaveLength(1);
    expect(queue[0].attempts).toBe(0);
  });

  it("discardFailed vacía la zona muerta", async () => {
    await enqueue({ payload: {} });
    for (let i = 0; i < 5; i += 1) await flushQueue(permErr);
    await discardFailed();
    expect(await getFailed()).toHaveLength(0);
  });

  it("clearPendingQueue limpia cola y zona muerta", async () => {
    await enqueue({ payload: {} });
    for (let i = 0; i < 5; i += 1) await flushQueue(permErr);
    await enqueue({ payload: {} });
    await clearPendingQueue("7");
    expect(await getPending()).toHaveLength(0);
    expect(await getFailed()).toHaveLength(0);
  });
});
