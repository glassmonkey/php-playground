export const MessageType = {
	SHOW_ALERT: 'SHOW_ALERT',
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];

export interface ShowAlertMessage {
	type: typeof MessageType.SHOW_ALERT;
	message: string;
}

export type WorkerMessage = ShowAlertMessage;
