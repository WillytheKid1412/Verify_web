import { validateRuntimeConfig } from "../src/config.js";
import { closePool } from "../src/db/pool.js";
import { createInitialAdmin } from "../src/repositories/authRepository.js";

async function seed() {
  validateRuntimeConfig();
  const username = process.env.ADMIN_USERNAME || "";
  const password = process.env.ADMIN_PASSWORD || "";
  if (!username || !password) throw new Error("Seed admin yêu cầu ADMIN_USERNAME và ADMIN_PASSWORD.");
  const result = await createInitialAdmin({ username, password });
  console.log(result.created
    ? `Đã tạo admin ${result.user.username}.`
    : `Admin ${result.user.username} đã tồn tại; không thay đổi mật khẩu.`);
}

try {
  await seed();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await closePool().catch(() => {});
}
