import AsyncStorage from "@react-native-async-storage/async-storage";
import { addReadingSession } from "../api";
import { enqueue, getPending, getFailed } from "../offline";
import { syncQueue, retryFailed, subscribeOfflineFailures } from "../offlineSync";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("../secureStorage", () => ({ getUserId: async () => "7" }));
jest.mock("../api", () => ({
  isNetworkError: (e) => !!(e && e.network),
  updateBook: jest.fn(async () => {}),
  addReadingSession: jest.fn(),
}));

const payload = {
  session: {
    user_book_id: 1,
    page: 10,
    duration_seconds: 120,
    pages_read: 2,
    book_completed: false,
    start_page: 8,
  },
};

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe("offlineSync failures", () => {
  it("avisa cuando un item pasa a la zona muerta", async () => {
    addReadingSession.mockRejectedValue({ status: 400 });
    await enqueue({ payload });
    const spy = jest.fn();
    const unsub = subscribeOfflineFailures(spy);

    for (let i = 0; i < 5; i += 1) await syncQueue();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ failed: 1 });
    expect(await getFailed()).toHaveLength(1);
    unsub();
  });

  it("retryFailed reintenta la zona muerta y sincroniza", async () => {
    addReadingSession.mockRejectedValue({ status: 400 });
    await enqueue({ payload });
    for (let i = 0; i < 5; i += 1) await syncQueue();
    expect(await getFailed()).toHaveLength(1);

    addReadingSession.mockResolvedValue({});
    await retryFailed();

    expect(await getFailed()).toHaveLength(0);
    expect(await getPending()).toHaveLength(0);
  });
});
