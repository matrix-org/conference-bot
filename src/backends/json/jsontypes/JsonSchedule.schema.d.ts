/* tslint:disable */
/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run json-schema-to-typescript to regenerate this file.
 */

/**
 * A simple JSON format to describe the schedule for a conference driven by conference-bot.
 */
export interface JSONSchedule {
  /**
   * Name of the conference
   */
  title: string;
  streams: JSONStream[];
  [k: string]: unknown;
}
/**
 * Information about a sequence of talks
 */
export interface JSONStream {
  talks: JSONTalk[];
  /**
   * Human-readable name for the stream
   */
  stream_name: string;
  [k: string]: unknown;
}
/**
 * Information about a scheduled talk
 */
export interface JSONTalk {
  /**
   * Unique ID for the talk
   */
  id: number;
  /**
   * Human-readable name for the talk
   */
  title: string;
  /**
   * Human-readable description of the talk
   */
  description: string;
  /**
   * Date and time, in RFC3339 format with Z timezone offset, of the start of the talk
   */
  start: string;
  /**
   * Date and time, in RFC3339 format with Z timezone offset, of the end of the talk
   */
  end: string;
  speakers: JSONSpeaker[];
  /**
   * Names of what tracks the talk is on.
   */
  tracks: string[];
  [k: string]: unknown;
}
/**
 * Information about someone who is giving a talk
 */
export interface JSONSpeaker {
  /**
   * Natural name for the speaker
   */
  display_name: string;
  /**
   * Matrix User ID (MXID) of the speaker
   */
  matrix_id: string;
  /**
   * E-mail address of the speaker
   */
  email: string;
  [k: string]: unknown;
}
