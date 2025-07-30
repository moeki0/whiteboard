# Export Format Documentation

## Overview
This document describes the JSON export format for Maplap project data.

## Export Types

### 1. Board Export (Individual Board)
Single board export containing all items within that board.

```json
{
  "board": {
    "id": "board_id",
    "name": "Board Name",
    "createdBy": "user_id",
    "createdAt": 1234567890,
    "projectId": "project_id",
    "updatedAt": 1234567890,
    "isPinned": false,
    "sortScore": 1000,
    "metadata": {
      "title": "Board Title",
      "description": "Board Description",
      "thumbnailUrl": "https://example.com/thumbnail.jpg"
    }
  },
  "notes": [
    {
      "id": "note_id",
      "type": "note",
      "content": "Note content text",
      "x": 2500,
      "y": 2600,
      "color": "yellow",
      "textSize": "medium",
      "width": "200px",
      "userId": "user_id",
      "createdAt": 1234567890,
      "updatedAt": 1234567890,
      "zIndex": 1,
      "signedBy": {
        "uid": "user_id",
        "displayName": "User Name",
        "photoURL": "https://example.com/photo.jpg"
      }
    }
  ],
  "arrows": [
    {
      "id": "arrow_id",
      "type": "arrow",
      "startNoteId": "note_id_1",
      "endNoteId": "note_id_2",
      "startAnchor": "auto",
      "endAnchor": "auto",
      "userId": "user_id",
      "createdAt": 1234567890,
      "zIndex": 2
    }
  ],
  "groups": [
    {
      "id": "group_id",
      "type": "group",
      "noteIds": ["note_id_1", "note_id_2"],
      "name": "Group Name",
      "color": "blue",
      "userId": "user_id",
      "createdAt": 1234567890,
      "zIndex": 3
    }
  ],
  "exportedAt": "2024-01-01T12:00:00.000Z",
  "version": "1.0.0",
  "env": "turtle"
}
```

### 2. Project Export (All Boards in Project)
Project export containing all boards and their data.

```json
{
  "boards": [
    {
      "board": { /* Board object as above */ },
      "notes": [ /* Array of note objects */ ],
      "arrows": [ /* Array of arrow objects */ ],
      "groups": [ /* Array of group objects */ ],
      "exportedAt": "2024-01-01T12:00:00.000Z",
      "version": "1.0.0"
    }
  ],
  "exportedAt": "2024-01-01T12:00:00.000Z",
  "version": "1.0.0",
  "env": "turtle"
}
```

## Data Types

### Board Object
| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique board identifier |
| `name` | string | Board display name |
| `createdBy` | string | User ID of creator |
| `createdAt` | number | Creation timestamp (Unix time) |
| `projectId` | string | Parent project ID |
| `updatedAt` | number | Last update timestamp (optional) |
| `isPinned` | boolean | Whether board is pinned (optional) |
| `sortScore` | number | Sort order score (optional) |
| `metadata` | object | Additional metadata (optional) |

### Note Object
| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique note identifier |
| `type` | "note" | Object type identifier |
| `content` | string | Note text content |
| `x` | number | X coordinate position (shifted +2400px from original) |
| `y` | number | Y coordinate position (shifted +2400px from original) |
| `color` | string | Note background color (optional) |
| `textSize` | string | Text size setting (optional) |
| `width` | string | Note width in CSS format |
| `userId` | string | User ID of creator |
| `createdAt` | number | Creation timestamp |
| `updatedAt` | number | Last update timestamp (optional) |
| `zIndex` | number | Display layer order |
| `signedBy` | object | User signature info (optional) |

### Arrow Object
| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique arrow identifier |
| `type` | "arrow" | Object type identifier |
| `startNoteId` | string | ID of starting note |
| `endNoteId` | string | ID of ending note |
| `startAnchor` | string | Start anchor position |
| `endAnchor` | string | End anchor position |
| `userId` | string | User ID of creator |
| `createdAt` | number | Creation timestamp |
| `zIndex` | number | Display layer order |

### Group Object
| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique group identifier |
| `type` | "group" | Object type identifier |
| `noteIds` | string[] | Array of note IDs in group |
| `name` | string | Group display name (optional) |
| `color` | string | Group color (optional) |
| `userId` | string | User ID of creator |
| `createdAt` | number | Creation timestamp |
| `zIndex` | number | Display layer order |

## Export Metadata
| Field | Type | Description |
|-------|------|-------------|
| `exportedAt` | string | ISO 8601 timestamp of export |
| `version` | string | Export format version |
| `env` | string | Source environment identifier ("turtle") |

## File Naming Convention
- **Board Export**: `{board_name}_export_{timestamp}.json`
- **Project Export**: `{project_name}_export_{timestamp}.json`

Where `{timestamp}` is in format: `YYYY-MM-DDTHH-mm-ss-sssZ`

## Notes
- All timestamps are Unix timestamps (milliseconds since epoch)
- Optional fields may not be present in the export if not set
- Coordinate positions (x, y) are shifted by +2400px from the original board positions
- Colors are typically CSS color names or hex values
- The export preserves all relational data (arrows reference note IDs, groups contain note ID arrays)