import type { ExpoPushMessage } from "expo-server-sdk";
import Expo from "expo-server-sdk";
import { db } from "./db/db";
import { deviceTokens } from "./db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../lib/log";
import { redis } from "./redis";

const expo = new Expo({
  accessToken: process.env.EXPO_ACCESS_TOKEN,
});

/**
 * Sends a push notification to a user's devices.
 * @param userId The ID of the user to send the notification to.
 * @param title The title of the notification.
 * @param body The body of the notification.
 * @param data Optional data to send with the notification.
 */
export async function sendPushNotification(
  userId: number,
  title: string,
  body: string,
  data: Record<string, unknown> = {},
) {
  const userDevices = await db
    .select()
    .from(deviceTokens)
    .where(eq(deviceTokens.userId, userId));

  if (userDevices.length === 0) {
    logger.warn(`No devices found for user ${userId}`);
    return;
  }

  const messages: ExpoPushMessage[] = userDevices
    .filter((device) => Expo.isExpoPushToken(device.token))
    .map((device) => ({
      to: device.token,
      sound: "default",
      title,
      body,
      data,
      priority: "high",
      channelId: "default",
    }));

  if (messages.length === 0) {
    logger.warn(`No valid Expo push tokens found for user ${userId}`);
    return;
  }

  const chunks = expo.chunkPushNotifications(messages);

  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      logger.info("Push notification result:", ticketChunk);

      ticketChunk.forEach((ticket, index) => {
        if (ticket.status === "error") {
          logger.error(
            `Error sending notification to token ${chunk[index].to}:`,
            ticket.message,
          );

          if (ticket.details?.error === "DeviceNotRegistered") {
            const token = String(chunk[index].to);

            db.delete(deviceTokens)
              .where(eq(deviceTokens.token, token))
              .execute()
              .catch(logger.error);
          }
        }
      });

      await redis.del(`notifications:${userId}`);
    } catch (error) {
      logger.error("Error sending push notification chunk:", error);
      throw error;
    }
  }
}
