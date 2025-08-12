CREATE TABLE "chart_thumbnails" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "chart_id" uuid NOT NULL,
    "url" varchar(2048) NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "chart_thumbnails" ADD CONSTRAINT "chart_thumbnails_chart_id_charts_id_fk" FOREIGN KEY ("chart_id") REFERENCES "public"."charts"("id") ON DELETE cascade ON UPDATE no action;