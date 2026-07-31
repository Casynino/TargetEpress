"use client";

import { useActionState, useState } from "react";
import { Lock, UserRound } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { changeMyPassword, updateMyProfile } from "@/lib/actions/profile";

export type EditableProfile = {
  displayName: string | null;
  phone: string | null;
  emergencyContact: string | null;
  preferredLanguage: string;
  photoUrl: string | null;
};

/**
 * The part of a profile an employee owns.
 *
 * Everything the company owns — employee number, department, rank, company
 * address, joining date — is shown next to this form as plain text, not as
 * disabled inputs. A greyed-out field invites people to try; a line of text
 * does not.
 */
export function PersonalDetailsForm({ profile }: { profile: EditableProfile }) {
  const [state, action] = useActionState(updateMyProfile, undefined);
  const [preview, setPreview] = useState<string | null>(profile.photoUrl);

  return (
    <form action={action} className="space-y-5 p-5">
      <FormError state={state} />
      {state?.ok ? (
        <p className="rounded-lg border border-success/40 bg-success/5 p-3 text-sm text-success">
          Saved.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        {preview ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={preview}
            alt="Your profile photo"
            className="h-16 w-16 rounded-xl border object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-xl border bg-muted text-muted-foreground">
            <UserRound className="h-6 w-6" />
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="photo">Profile photo</Label>
          <Input
            id="photo"
            name="photo"
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              // A local preview only — nothing is uploaded until Save.
              setPreview(file ? URL.createObjectURL(file) : profile.photoUrl);
            }}
          />
          <p className="text-xs text-muted-foreground">
            Leave empty to keep the photo you have.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="displayName">Display name</Label>
          <Input
            id="displayName"
            name="displayName"
            defaultValue={profile.displayName ?? ""}
            placeholder="What people call you"
            maxLength={60}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone number</Label>
          <Input
            id="phone"
            name="phone"
            defaultValue={profile.phone ?? ""}
            placeholder="+255 7…"
            inputMode="tel"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="emergencyContact">Emergency contact</Label>
          <Input
            id="emergencyContact"
            name="emergencyContact"
            defaultValue={profile.emergencyContact ?? ""}
            placeholder="Name and number"
            maxLength={120}
          />
          <p className="text-xs text-muted-foreground">
            Optional. Only management can see this.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="preferredLanguage">Preferred language</Label>
          <NativeSelect
            id="preferredLanguage"
            name="preferredLanguage"
            defaultValue={profile.preferredLanguage}
          >
            <option value="en">English</option>
            <option value="sw">Kiswahili</option>
            <option value="zh">中文</option>
          </NativeSelect>
        </div>
      </div>

      <SubmitButton variant="brand" pendingLabel="Saving…">
        Save changes
      </SubmitButton>
    </form>
  );
}

/** Changing your own password, which needs the old one. */
export function PasswordForm() {
  const [state, action] = useActionState(changeMyPassword, undefined);

  return (
    <form action={action} className="space-y-4 p-5">
      <FormError state={state} />
      {state?.ok ? (
        <p className="rounded-lg border border-success/40 bg-success/5 p-3 text-sm text-success">
          Password changed. It applies the next time you sign in.
        </p>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="current">Current password</Label>
        <Input id="current" name="current" type="password" required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="next">New password</Label>
          <Input
            id="next"
            name="next"
            type="password"
            minLength={10}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Repeat new password</Label>
          <Input id="confirm" name="confirm" type="password" required />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        At least 10 characters. This account can move other people&apos;s cargo.
      </p>

      <SubmitButton variant="outline" pendingLabel="Changing…">
        <Lock className="mr-2 h-4 w-4" />
        Change password
      </SubmitButton>
    </form>
  );
}
