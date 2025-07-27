from flask import Flask, request
import os
from dotenv import load_dotenv

load_dotenv()
VERIFY_TOKEN = os.getenv("VERIFY_TOKEN")

app = Flask(__name__)

@app.route("/webhook", methods=["GET","POST"])
def webhook():
    if request.method == "GET":
        mode      = request.args.get("hub.mode")
        token     = request.args.get("hub.verify_token")
        challenge = request.args.get("hub.challenge")

        # debug log
        print(f"Handshake GET → mode={mode}, token={token}, expected={VERIFY_TOKEN}")

        if mode == "subscribe" and token == VERIFY_TOKEN:
            return challenge, 200, {"Content-Type": "text/plain"}
        return "Verification failed", 403

    # handle POSTs here…
    return "OK", 200

if __name__ == "__main__":
    app.run(port=5000)
