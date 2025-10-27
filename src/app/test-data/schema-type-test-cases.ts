// Test Schema Type Detection
// This file contains sample schemas to test our detectSchemaType function

// Sample JSON Schema
export const jsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "age": { "type": "number" }
  },
  "required": ["name"]
};

// Sample Avro Schema
export const avroSchema = {
  "type": "record",
  "name": "User",
  "fields": [
    {"name": "id", "type": "string"},
    {"name": "email", "type": "string"},
    {"name": "age", "type": ["null", "int"], "default": null}
  ]
};

// Sample Protobuf Schema (as string)
export const protobufSchema = `
syntax = "proto3";

package user;

message User {
  string id = 1;
  string email = 2;
  int32 age = 3;
}

service UserService {
  rpc GetUser(GetUserRequest) returns (User);
}

message GetUserRequest {
  string id = 1;
}
`;

// Test cases for schema type detection
export const testCases = [
  {
    name: "JSON Schema with $schema",
    schema: jsonSchema,
    expectedType: "JSON"
  },
  {
    name: "Avro Record Schema",
    schema: avroSchema,
    expectedType: "AVRO"
  },
  {
    name: "Protobuf Schema String",
    schema: protobufSchema,
    expectedType: "PROTOBUF"
  },
  {
    name: "JSON Schema without $schema but with properties",
    schema: {
      "type": "object",
      "properties": {
        "name": { "type": "string" }
      }
    },
    expectedType: "JSON"
  },
  {
    name: "Avro Enum Schema",
    schema: {
      "type": "enum",
      "name": "Status",
      "symbols": ["ACTIVE", "INACTIVE", "PENDING"]
    },
    expectedType: "AVRO"
  }
];