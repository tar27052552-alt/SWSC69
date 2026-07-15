const gasUrl = "https://script.google.com/macros/s/AKfycbwtcOIix-iPdAxLcJMrvoLxCMj1vuzIRU-XyZlFGYTQCkIc4R5Ykn9_6F96fRiDT5IBJA/exec";

async function testAnnounce() {
  try {
    const payload = {
      action: "send_discord_message",
      title: "📢 ทดสอบระบบประกาศด่วน",
      description: "นี่คือการทดสอบการส่งประกาศด่วนจากระบบหลังบ้าน",
      color: 15105570,
      fields: [
        { name: "👤 ผู้ทดสอบ", value: "ระบบทดสอบอัตโนมัติ", inline: true },
        { name: "🏢 ฝ่าย", value: "เทคโนโลยีสารสนเทศ", inline: true }
      ],
      imageUrl: null,
      channel: "general",
      targetUserIds: ["eeeac987-28ce-4e7c-a1d4-3730e22f7cb8"]
    };

    console.log("Sending request to GAS:", gasUrl);
    const response = await fetch(gasUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`HTTP error! status: ${response.status}`);
      return;
    }

    const data = await response.json();
    console.log("GAS Response:", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error running test:", error);
  }
}

testAnnounce();
