// Message types from Service Worker to Client
export const ClientMessageType = {
	SHOW_ALERT: 'SHOW_ALERT',
} as const;

export type ClientMessageType = (typeof ClientMessageType)[keyof typeof ClientMessageType];

export interface ShowAlertMessage {
	type: typeof ClientMessageType.SHOW_ALERT;
	message: string;
}

export type ClientMessage = ShowAlertMessage;

// Message types from Client to Service Worker
export const WorkerMessageType = {
	TRIGGER_ALERT: 'TRIGGER_ALERT',
} as const;

export type WorkerMessageType = (typeof WorkerMessageType)[keyof typeof WorkerMessageType];

export interface TriggerAlertMessage {
	type: typeof WorkerMessageType.TRIGGER_ALERT;
}

export type WorkerMessage = TriggerAlertMessage;
