const { json } = require("../lib/orders");
const { describeOffer } = require("../lib/black-friday");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Методот не е дозволен." });
  res.setHeader("Cache-Control", "no-store");
  return json(res, 200, describeOffer());
};
