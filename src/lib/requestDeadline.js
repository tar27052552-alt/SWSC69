export async function fetchWithDeadline(url, options = {}, timeoutMs = 30000, uncertainWrite = false) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { ...options, signal: controller.signal });
        const text = await response.text();
        return { response, text };
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          const error = new Error(uncertainWrite
            ? 'หมดเวลารอผลการบันทึก ระบบอาจบันทึกแล้ว กรุณาตรวจรายการก่อนส่งใหม่'
            : 'โหลดข้อมูลนานเกินกำหนด กรุณาลองใหม่');
          error.code = 'REQUEST_TIMEOUT';
          error.uncertainWrite = uncertainWrite;
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally { clearTimeout(timer); }
}
