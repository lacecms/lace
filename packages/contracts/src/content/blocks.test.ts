// @ts-nocheck
// TODO(rf2): Type mutable transport fixtures and deliberately malformed metadata.
import { blockKey } from "@lacecms/domain";
import * as v from "valibot";
import { describe, expect, test } from "vitest";
import {
  publicContentEntrySchema,
  toPublicContentEntryDto,
  toPublicContentListDto,
  blockMetadataSchema,
  contentEntrySchema,
  mediaUrl,
  saveDraftRequestSchema,
  toBuildExportDto,
  toContentEntryDto,
} from "../index.js";
import { block, draft, published, entry } from "../test-support/rest-fixtures.js";

describe("admin entry list contracts", () => {
  test("block envelopes have explicit admin, request, public and metadata contracts", () => {
    const shown = {
      ...block,
      anchor: "pricing",
      className: "wide md:w-1/2",
      settings: { align: "center" },
    };
    const hiddenBlock = { ...block, hidden: true, key: blockKey("hero-2"), position: 2_000 };
    const envelopeEntry = {
      ...entry,
      draft: { ...draft, blocks: [shown, hiddenBlock] },
      published: { ...published, blocks: [hiddenBlock, shown] },
    };
    const admin = toContentEntryDto(envelopeEntry);
    expect(admin.draft.blocks).toEqual([
      {
        anchor: "pricing",
        className: "wide md:w-1/2",
        data: { heading: "Welcome" },
        hidden: false,
        key: "hero-1",
        position: 1_000,
        schemaVersion: 1,
        settings: { align: "center" },
        type: "hero",
      },
      {
        data: { heading: "Welcome" },
        hidden: true,
        key: "hero-2",
        position: 2_000,
        schemaVersion: 1,
        settings: {},
        type: "hero",
      },
    ]);
    expect(v.parse(contentEntrySchema, admin)).toEqual(admin);

    const urlFor = (id) => mediaUrl("https://lace.example/", id);
    const publicDto = toPublicContentEntryDto(
      { entry: envelopeEntry, media: [], path: "/blog/welcome" },
      urlFor,
    );
    expect(publicDto.entry.blocks).toEqual([
      {
        anchor: "pricing",
        className: "wide md:w-1/2",
        data: { heading: "Welcome" },
        key: "hero-1",
        position: 1_000,
        schemaVersion: 1,
        settings: { align: "center" },
        type: "hero",
      },
    ]);
    expect(v.parse(publicContentEntrySchema, publicDto)).toEqual(publicDto);
    const { settings: _settings, ...legacyBlock } = publicDto.entry.blocks[0];
    expect(
      v.parse(publicContentEntrySchema, {
        ...publicDto,
        entry: { ...publicDto.entry, blocks: [legacyBlock] },
      }).entry.blocks[0].settings,
    ).toEqual({});
    expect(
      v.safeParse(publicContentEntrySchema, {
        ...publicDto,
        entry: { ...publicDto.entry, blocks: [{ ...publicDto.entry.blocks[0], hidden: false }] },
      }).success,
    ).toBe(false);
    expect(
      toPublicContentListDto(
        { items: [{ entry: envelopeEntry, media: [], path: "/a" }] },
        urlFor,
      ).items[0].blocks.map((value) => value.key),
    ).toEqual(["hero-1"]);
    expect(
      toBuildExportDto(
        { entries: [{ entry: envelopeEntry, media: [], path: "/a" }], version: 1 },
        urlFor,
      ).entries[0].blocks.map((value) => value.key),
    ).toEqual(["hero-1"]);

    const request = {
      blocks: [{ data: {}, key: "hero-1", position: 1_000, schemaVersion: 1, type: "hero" }],
      fields: {},
      title: "Welcome",
    };
    const withBlock = (envelope) => ({
      ...request,
      blocks: [{ ...request.blocks[0], ...envelope }],
    });
    expect(
      v.parse(
        saveDraftRequestSchema,
        withBlock({ anchor: "faq-2", className: " a  b ", hidden: true, settings: { x: 1 } }),
      ).blocks[0],
    ).toMatchObject({ anchor: "faq-2", className: " a  b ", hidden: true, settings: { x: 1 } });
    for (const invalid of [
      { hidden: "yes" },
      { anchor: "Top" },
      { anchor: "" },
      { className: "a<b" },
      { className: "" },
      { settings: [] },
      { visible: true },
    ]) {
      expect(
        v.safeParse(saveDraftRequestSchema, withBlock(invalid)).success,
        JSON.stringify(invalid),
      ).toBe(false);
    }

    const metadata = {
      fields: {},
      settings: {
        align: {
          defaultValue: "left",
          options: ["left", "center"],
          required: false,
          type: "select",
        },
      },
      type: "panel",
      version: 1,
    };
    expect(v.parse(blockMetadataSchema, metadata)).toEqual(metadata);
    for (const settings of [
      { image: { defaultValue: "m", required: false, type: "media" } },
      { size: { required: false, type: "number" } },
      {},
    ]) {
      expect(
        v.safeParse(blockMetadataSchema, { ...metadata, settings }).success,
        JSON.stringify(settings),
      ).toBe(false);
    }
  });
});
