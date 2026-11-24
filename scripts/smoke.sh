#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
SUFFIX="$(date +%s)"

api() {
  local method="$1" path="$2" body="${3:-}"
  local response status
  if [[ -n "$body" ]]; then
    response="$(curl -sS -X "$method" "$BASE_URL$path" \
      -H 'Content-Type: application/json' -d "$body" -w $'\n%{http_code}')"
  else
    response="$(curl -sS -X "$method" "$BASE_URL$path" -w $'\n%{http_code}')"
  fi
  status="$(tail -n1 <<<"$response")"
  body="$(sed '$d' <<<"$response")"
  if [[ "$status" -ge 400 ]]; then
    echo "FAIL  $method $path -> HTTP $status" >&2
    echo "$body" >&2
    exit 1
  fi
  echo "$body"
}

pick() {
  node -e '
    let raw = "";
    process.stdin.on("data", (chunk) => (raw += chunk)).on("end", () => {
      const value = process.argv[1]
        .split(".")
        .reduce((acc, key) => (acc == null ? acc : acc[key]), JSON.parse(raw));
      if (value === undefined || value === null) {
        console.error(`missing field: ${process.argv[1]}`);
        process.exit(1);
      }
      process.stdout.write(String(value));
    });
  ' "$1"
}

step() { printf '\n\033[1m%s\033[0m\n' "$1"; }

step "0. Health"
api GET /health

step "1. Create three users"
ALICE="$(api POST /user "{\"username\":\"alice_$SUFFIX\",\"displayName\":\"Alice\"}" | pick data.user.userId)"
BOB="$(api POST /user "{\"username\":\"bob_$SUFFIX\",\"displayName\":\"Bob\"}" | pick data.user.userId)"
CAROL="$(api POST /user "{\"username\":\"carol_$SUFFIX\",\"displayName\":\"Carol\"}" | pick data.user.userId)"
echo "alice=$ALICE"
echo "bob=$BOB"
echo "carol=$CAROL"

step "2. POST /chat/create (and again, reversed: must return the same chat)"
CHAT="$(api POST /chat/create "{\"userAId\":\"$ALICE\",\"userBId\":\"$BOB\"}" | pick data.chatId)"
AGAIN="$(api POST /chat/create "{\"userAId\":\"$BOB\",\"userBId\":\"$ALICE\"}" | pick data.chatId)"
echo "chatId=$CHAT"
[[ "$CHAT" == "$AGAIN" ]] || { echo "FAIL  create-or-get is not idempotent: $CHAT != $AGAIN" >&2; exit 1; }
echo "idempotent: both orders returned the same chatId"

step "3. POST /chat/:chatId/message/send"
M1="$(api POST "/chat/$CHAT/message/send" "{\"senderId\":\"$ALICE\",\"text\":\"Hey Bob, standup at 10?\"}" | pick data.message.messageId)"
M2="$(api POST "/chat/$CHAT/message/send" "{\"senderId\":\"$BOB\",\"text\":\"Works for me.\"}" | pick data.message.messageId)"
M3="$(api POST "/chat/$CHAT/message/send" "{\"senderId\":\"$ALICE\",\"text\":\"See you then.\"}" | pick data.message.messageId)"
echo "messages: $M1 $M2 $M3"

step "4. GET /chat/:chatId/messages?limit=50 (ordered oldest first)"
api GET "/chat/$CHAT/messages?limit=50" |
  node -e 'let r="";process.stdin.on("data",d=>r+=d).on("end",()=>{for(const m of JSON.parse(r).data.messages)console.log(`  ${m.createdAt}  ${m.senderId.slice(0,8)}  ${JSON.stringify(m.text)}`)})'

step "5. Paging: ?limit=2 then follow pageInfo.nextBefore"
PAGE="$(api GET "/chat/$CHAT/messages?limit=2")"
echo "$PAGE" | node -e 'let r="";process.stdin.on("data",d=>r+=d).on("end",()=>{const p=JSON.parse(r).data;console.log("  page 1:",p.messages.map(m=>m.text),"pageInfo:",JSON.stringify(p.pageInfo))})'
CURSOR="$(echo "$PAGE" | pick data.pageInfo.nextBefore)"
api GET "/chat/$CHAT/messages?limit=2&before=$CURSOR" |
  node -e 'let r="";process.stdin.on("data",d=>r+=d).on("end",()=>{const p=JSON.parse(r).data;console.log("  page 2:",p.messages.map(m=>m.text),"pageInfo:",JSON.stringify(p.pageInfo))})'

step "6. POST /chat/:chatId/message/:messageId/read"
api POST "/chat/$CHAT/message/$M1/read" "{\"userId\":\"$BOB\"}" |
  node -e 'let r="";process.stdin.on("data",d=>r+=d).on("end",()=>console.log("  readBy:",JSON.stringify(JSON.parse(r).data.message.readBy)))'

step "7. POST /chat/:chatId/lastseen"
api POST "/chat/$CHAT/lastseen" "{\"userId\":\"$BOB\",\"messageId\":\"$M2\"}" |
  node -e 'let r="";process.stdin.on("data",d=>r+=d).on("end",()=>console.log("  lastSeen:",JSON.stringify(JSON.parse(r).data.lastSeen)))'

step "8. GET /user/:userId/chats (member ids, last message, unread count)"
api GET "/user/$BOB/chats" |
  node -e 'let r="";process.stdin.on("data",d=>r+=d).on("end",()=>{for(const c of JSON.parse(r).data.chats)console.log(`  ${c.chatId}  type=${c.type}  members=${c.memberIds.length}  unread=${c.unreadCount}  last=${JSON.stringify(c.lastMessage&&c.lastMessage.text)}`)})'

step "9. Bonus: group chat creation and membership"
GROUP="$(api POST /chat/group/create "{\"name\":\"Weekend plans\",\"creatorId\":\"$ALICE\",\"memberIds\":[\"$BOB\"]}" | pick data.chatId)"
echo "groupId=$GROUP"
api POST "/chat/$GROUP/members" "{\"actorId\":\"$ALICE\",\"userIds\":[\"$CAROL\"]}" |
  node -e 'let r="";process.stdin.on("data",d=>r+=d).on("end",()=>console.log("  members after add:",JSON.parse(r).data.chat.memberIds.length))'
api POST "/chat/$GROUP/message/send" "{\"senderId\":\"$CAROL\",\"text\":\"Trek on Saturday?\"}" > /dev/null
echo "  carol posted to the group"
api DELETE "/chat/$GROUP/members/$CAROL" "{\"actorId\":\"$CAROL\"}" |
  node -e 'let r="";process.stdin.on("data",d=>r+=d).on("end",()=>console.log("  members after carol leaves:",JSON.parse(r).data.chat.memberIds.length))'

step "10. Bonus: edit and delete a message"
api PATCH "/chat/$CHAT/message/$M3" "{\"userId\":\"$ALICE\",\"text\":\"See you at 10 sharp.\"}" |
  node -e 'let r="";process.stdin.on("data",d=>r+=d).on("end",()=>{const m=JSON.parse(r).data.message;console.log(`  edited: ${JSON.stringify(m.text)} isEdited=${m.isEdited}`)})'
api DELETE "/chat/$CHAT/message/$M3" "{\"userId\":\"$ALICE\"}" |
  node -e 'let r="";process.stdin.on("data",d=>r+=d).on("end",()=>{const m=JSON.parse(r).data.message;console.log(`  deleted: text=${JSON.stringify(m.text)} isDeleted=${m.isDeleted}`)})'

step "11. Authorisation and validation checks (all expected to fail)"
expect_status() {
  local expected="$1" method="$2" path="$3" body="${4:-}"
  local status
  if [[ -n "$body" ]]; then
    status="$(curl -sS -o /dev/null -w '%{http_code}' -X "$method" "$BASE_URL$path" \
      -H 'Content-Type: application/json' -d "$body")"
  else
    status="$(curl -sS -o /dev/null -w '%{http_code}' -X "$method" "$BASE_URL$path")"
  fi
  if [[ "$status" != "$expected" ]]; then
    echo "FAIL  $method $path -> expected $expected, got $status" >&2
    exit 1
  fi
  printf '  %s %-56s -> %s as expected\n' "$method" "$path" "$status"
}
expect_status 403 POST "/chat/$CHAT/message/send" "{\"senderId\":\"$CAROL\",\"text\":\"let me in\"}"
expect_status 400 POST "/chat/create" "{\"userAId\":\"$ALICE\",\"userBId\":\"$ALICE\"}"
expect_status 400 POST "/chat/$CHAT/message/send" "{\"senderId\":\"$ALICE\",\"text\":\"\"}"
expect_status 404 GET "/chat/00000000-0000-4000-8000-000000000000/messages"
expect_status 409 POST "/user" "{\"username\":\"alice_$SUFFIX\",\"displayName\":\"Impostor\"}"

printf '\n\033[32mAll smoke checks passed.\033[0m\n'
