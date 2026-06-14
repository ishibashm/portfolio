fetch("http://localhost:3000/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
})
  .then(async (res) => {
    console.log("Status:", res.status);
    console.log("Headers:", res.headers);
    const reader = res.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      console.log(new TextDecoder().decode(value));
    }
  })
  .catch(console.error);
