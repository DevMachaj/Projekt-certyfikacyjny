import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";

// Dev-only: live demos of the S-08 base components, rendered as ONE client island
// on /design-preview. Radix primitives (Checkbox/Dialog) don't survive Astro's
// static per-component SSR, so the whole set is composed here as a normal React
// tree and mounted with client:only. Not shipped to any real screen.
function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="text-foreground mb-4 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function DesignSystemPreview() {
  return (
    <>
      <Row title="Buttons">
        <div className="border-border bg-card space-y-4 rounded-lg border p-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Dodaj produkt</Button>
            <Button variant="secondary">Anuluj</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Usuń</Button>
            <Button variant="link">Link</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="default">Default</Button>
            <Button size="lg">Large</Button>
            <Button disabled>Disabled</Button>
          </div>
        </div>
      </Row>

      <Row title="Inputs">
        <div className="border-border bg-card grid max-w-md gap-3 rounded-lg border p-6">
          <Input placeholder="Nazwa produktu" />
          <Input variant="numeric" suffix="dni" defaultValue={7} />
          <Input variant="numeric" suffix="szt." defaultValue={48} />
          <Input invalid defaultValue="0" />
          <Input placeholder="Wyłączone" disabled />
        </div>
      </Row>

      <Row title="Cards">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Plan zatowarowania</CardTitle>
              <CardDescription>Co zamówić w tym tygodniu</CardDescription>
              <CardAction>
                <Button size="sm">Generuj</Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">Domyślna karta — białe tło, hairline border, cichy cień.</p>
            </CardContent>
          </Card>
          <Card className="bg-muted shadow-none">
            <CardHeader>
              <CardTitle>Sekcja (muted)</CardTitle>
              <CardDescription>Wariant sunken do grupowania</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">Bez cienia, tło surface-muted.</p>
            </CardContent>
          </Card>
        </div>
      </Row>

      <Row title="Checkbox">
        <div className="border-border bg-card flex items-center gap-6 rounded-lg border p-6">
          <span className="text-foreground flex items-center gap-2 text-sm">
            <Checkbox /> Unchecked
          </span>
          <span className="text-foreground flex items-center gap-2 text-sm">
            <Checkbox defaultChecked /> Checked
          </span>
        </div>
      </Row>

      <Row title="Dialog">
        <Dialog>
          <DialogTrigger asChild>
            <Button>Otwórz dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Dodaj produkt</DialogTitle>
              <DialogDescription>Podaj podstawowe dane, resztę uzupełnisz później.</DialogDescription>
            </DialogHeader>
            <Input placeholder="Nazwa" />
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary">Anuluj</Button>
              </DialogClose>
              <Button>Zapisz</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Row>
    </>
  );
}
