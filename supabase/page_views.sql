-- Create page_views table
CREATE TABLE IF NOT EXISTS page_views (
    path TEXT PRIMARY KEY,
    view_count INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Enable RLS
ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access" ON page_views 
    FOR SELECT USING (true);

-- Function to increment page views safely
CREATE OR REPLACE FUNCTION increment_page_view(page_path TEXT)
RETURNS void
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO page_views (path, view_count)
  VALUES (page_path, 1)
  ON CONFLICT (path) DO UPDATE
  SET view_count = page_views.view_count + 1,
      updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to get total page views
CREATE OR REPLACE FUNCTION get_total_views()
RETURNS INTEGER AS $$
DECLARE
  total INTEGER;
BEGIN
  SELECT COALESCE(SUM(view_count), 0) INTO total FROM page_views;
  RETURN total;
END;
$$ LANGUAGE plpgsql;
