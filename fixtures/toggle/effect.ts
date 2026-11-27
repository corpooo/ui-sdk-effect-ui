// The `toggle` fixture, rewritten for Effect UI from UI SDK's
// apps/playground/src/fixtures/toggle/react.tsx (Apache-2.0, see NOTICE).
// Where React's handlers cancel a change or return a Promise, the fixture's
// Model holds the value and its `update` decides.
import { Button } from "@corpooo/ui-sdk-effect-ui/button";
import { Separator } from "@corpooo/ui-sdk-effect-ui/separator";
import { Toggle, ToggleGroup } from "@corpooo/ui-sdk-effect-ui/toggle";
import { UiSchema } from "@effect/ui";
import { BrowserHost, Html } from "@effect/ui/html";
import { Effect, Layer, Schema } from "effect";
import { changedValue, toggleOptions } from "tests/fixtures/page.ts";
import { toggleAction, toggleFixture } from "tests/fixtures/toggle.ts";

const GroupName = Schema.Literals(["alignment", "formatting"]);

const FixtureMessage = UiSchema.TaggedEnum({
  RequestedPressedBookmark: { pressed: Schema.Boolean },
  RequestedValueGroup: { name: GroupName, value: Schema.Array(Schema.String) },
  ClickedClearFormatting: {},
  SubmittedForm: {},
  PressedSubmit: {},
  ClickedFinishSaving: {},
  PressedDelete: {},
  PressedArchive: {},
  PressedSave: { source: Schema.String },
  PressedPublish: {},
  ClickedFinishPublishing: {},
  ClickedFailPublishing: {},
});

const FixtureModel = Schema.Struct({
  action: Schema.String,
  pressedWith: Schema.String,
  submissions: Schema.Number,
  // The fixture owns every value, so it can refuse the change `?cancel` names.
  bookmark: Schema.Boolean,
  alignment: Schema.Array(Schema.String),
  formatting: Schema.Array(Schema.String),
  // The work "Submit" and "Publish" start, which their finish buttons end.
  saving: Schema.Boolean,
  publishing: Schema.Boolean,
});

// The fixture, with the options the page's URL sets. See `toggleOptions`.
function fixture() {
  const { cancel, defaultPressed, disabled, alignment, ...groupOptions } = toggleOptions();

  return Html.component({
    name: "ToggleFixture",
    model: FixtureModel,
    message: FixtureMessage,
  }).make({
    init: () => ({
      action: "",
      pressedWith: "",
      submissions: 0,
      bookmark: defaultPressed,
      alignment: alignment ? [alignment] : toggleFixture.alignment.defaultValue,
      formatting: toggleFixture.formatting.defaultValue,
      saving: false,
      publishing: false,
    }),
    update: ($, message) => {
      // A group takes a value by getting it back as its prop, and keeps its old one otherwise.
      const requestedValue = (name: typeof GroupName.Type, value: ReadonlyArray<string>) =>
        cancel && changedValue($.model[name], value) === cancel
          ? $.model
          : $.evolve({ [name]: value, action: toggleAction.group(name, [...value]) });
      return FixtureMessage.match(message, {
        RequestedPressedBookmark: ({ pressed }) =>
          cancel === toggleFixture.toggle.value
            ? $.model
            : $.evolve({ bookmark: pressed, action: toggleAction.toggle(pressed) }),
        RequestedValueGroup: ({ name, value }) => requestedValue(name, value),
        ClickedClearFormatting: () => requestedValue("formatting", []),
        SubmittedForm: () => $.evolve({ submissions: (count) => count + 1 }),
        PressedSubmit: () => $.evolve({ saving: true }),
        ClickedFinishSaving: () => $.evolve({ saving: false }),
        PressedDelete: () => $.evolve({ action: "delete" }),
        PressedArchive: () => $.evolve({ action: "archive" }),
        PressedSave: ({ source }) => $.evolve({ action: "save", pressedWith: source }),
        PressedPublish: () => $.evolve({ action: "publishing", publishing: true }),
        ClickedFinishPublishing: () =>
          $.model.publishing ? $.evolve({ action: "published", publishing: false }) : $.model,
        ClickedFailPublishing: () => $.evolve({ publishing: false }),
      });
    },
    view: (h, model) => {
      const group = (
        { name, label, items }: typeof toggleFixture.alignment,
        props: { multiple?: boolean; disabled?: boolean },
      ) =>
        ToggleGroup(h, {
          key: name,
          props: {
            value: model[name as typeof GroupName.Type],
            ...groupOptions,
            ...props,
          },
          onEmit: {
            RequestedValue: ({ value }) =>
              FixtureMessage.RequestedValueGroup({ name: name as typeof GroupName.Type, value }),
          },
          view: (toggleGroup) =>
            toggleGroup
              .group(h.div.class("toggle-group").attr("aria-label", label))
              .children(
                items.map((item) =>
                  toggleGroup
                    .item(h.button.key(item.value).class("toggle"), item)
                    .children(item.label),
                ),
              ),
        });

      return h.div.class("fixture").children(
        h.button("Before"),
        Toggle(h, {
          props: { pressed: model.bookmark },
          onEmit: {
            RequestedPressed: ({ pressed }) => FixtureMessage.RequestedPressedBookmark({ pressed }),
          },
          view: (toggle) =>
            toggle.root(h.button.class("toggle")).children(toggleFixture.toggle.label),
        }),
        group(toggleFixture.alignment, {}),
        Separator(h.div.class("rule"), { orientation: "vertical" }),
        group(toggleFixture.formatting, { multiple: true, disabled }),
        h.form
          .attr("aria-label", toggleFixture.form.label)
          .on("submit", FixtureMessage.SubmittedForm(), { preventDefault: "always" })
          .children(
            h.label.children(
              `${toggleFixture.form.field} `,
              h.input.attrs({ name: "name", value: toggleFixture.form.defaultName }),
            ),
            Button(h, {
              key: "submit",
              props: { type: "submit", pending: model.saving },
              onEmit: { Pressed: () => FixtureMessage.PressedSubmit() },
              view: (button) => button.root(h.button.class("button")).children("Submit"),
            }),
            Button(h, {
              key: "reset",
              props: { type: "reset" },
              onEmit: { Pressed: () => undefined },
              view: (button) => button.root(h.button.class("button")).children("Reset"),
            }),
            Button(h, {
              key: "delete",
              props: { disabled: true },
              onEmit: { Pressed: () => FixtureMessage.PressedDelete() },
              view: (button) => button.root(h.button.class("button")).children("Delete"),
            }),
            Button(h, {
              key: "archive",
              props: { type: "submit", disabled: true, focusableWhenDisabled: true },
              onEmit: { Pressed: () => FixtureMessage.PressedArchive() },
              view: (button) => button.root(h.button.class("button")).children("Archive"),
            }),
          ),
        Button(h, {
          key: "save",
          onEmit: { Pressed: ({ source }) => FixtureMessage.PressedSave({ source }) },
          view: (button) => button.root(h.button.class("button")).children("Save"),
        }),
        Button(h, {
          key: "publish",
          props: { pending: model.publishing },
          onEmit: { Pressed: () => FixtureMessage.PressedPublish() },
          view: (button) => button.root(h.button.class("button")).children("Publish"),
        }),
        h.button.on("click", FixtureMessage.ClickedClearFormatting()).children("Clear formatting"),
        h.button.on("click", FixtureMessage.ClickedFinishSaving()).children("Finish saving"),
        h.button
          .on("click", FixtureMessage.ClickedFinishPublishing())
          .children("Finish publishing"),
        h.button.on("click", FixtureMessage.ClickedFailPublishing()).children("Fail publishing"),
        Button(h, {
          key: "docs",
          onEmit: { Pressed: () => undefined },
          view: (button) =>
            button
              .root(h.a.class("button").attr("href", toggleFixture.docs.href))
              .children(toggleFixture.docs.label),
        }),
        Button(h, {
          key: "changelog",
          props: { disabled: true },
          onEmit: { Pressed: () => undefined },
          view: (button) =>
            button
              .root(h.a.class("button").attr("href", toggleFixture.changelog.href))
              .children(toggleFixture.changelog.label),
        }),
        Separator(h.div.class("rule")),
        Separator(h.div.class("rule"), { decorative: true }),
        h.button("After"),
        h.output.attrs({ role: "status", "aria-label": "Last action" }).children(model.action),
        h.output.attr("aria-label", "Submissions").children(String(model.submissions)),
        h.output.attr("aria-label", "Pressed with").children(model.pressedWith),
      );
    },
  });
}

function mount(root: HTMLElement) {
  Layer.launch(BrowserHost.mount(fixture(), {}, root)).pipe(Effect.runFork);
}

export { fixture, mount };
