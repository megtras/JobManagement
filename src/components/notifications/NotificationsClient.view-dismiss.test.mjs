import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const clientSource = readFileSync(new URL("./NotificationsClient.tsx", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../../app/api/notifications/route.ts", import.meta.url), "utf8");

test("notification list only shows active unread notifications", () => {
  assert.match(routeSource, /where: \{ userId: session\.user\.id, isRead: false \}/);
  assert.match(routeSource, /const unreadCount = notifications\.length/);
});

test("viewing a notification marks only that item read, removes it from the list, then navigates", () => {
  assert.match(clientSource, /import \{ useRouter \} from "next\/navigation"/);
  assert.match(clientSource, /const router = useRouter\(\)/);
  assert.match(clientSource, /const viewNotification = async \(notification: NotificationItem\) =>/);
  assert.match(clientSource, /body: JSON\.stringify\(\{ notificationId: notification\.id \}\)/);
  assert.match(clientSource, /setItems\(\(prev\) => prev\.filter\(\(n\) => n\.id !== notification\.id\)\)/);
  assert.match(clientSource, /router\.push\(href\)/);
  assert.doesNotMatch(clientSource, /<Link[\s\S]*View[\s\S]*<\/Link>/);
  assert.match(routeSource, /const notificationId = typeof body\.notificationId === "string" \? body\.notificationId : ""/);
  assert.match(routeSource, /where: \{ id: notificationId, userId: session\.user\.id \}/);
});

test("mark all as read clears the visible notification list", () => {
  assert.match(clientSource, /await fetch\("\/api\/notifications", \{ method: "PATCH" \}\)/);
  assert.match(clientSource, /setItems\(\[\]\)/);
});
