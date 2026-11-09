using LumenX.Api.Sales;

namespace LumenX.Api.Tests;

public class SalesCsvParserTests
{
    private static CsvParseResult Parse(string text) => SalesCsvParser.Parse(new StringReader(text));

    [Fact]
    public void Semicolon_with_italian_dates_and_decimal_comma()
    {
        var result = Parse("date;quantity\n01/02/2025;12,5\n02/02/2025;7\n");

        Assert.Null(result.FatalError);
        Assert.Empty(result.Errors);
        Assert.Equal(2, result.Rows.Count);
        Assert.Equal(new DateOnly(2025, 2, 1), result.Rows[0].Date);
        Assert.Equal(12.5, result.Rows[0].Quantity);
        Assert.Equal(7.0, result.Rows[1].Quantity);
    }

    [Fact]
    public void Comma_with_iso_dates_and_decimal_point()
    {
        var result = Parse("date,quantity\n2025-01-01,10.25\n2025-01-02,11\n");

        Assert.Empty(result.Errors);
        Assert.Equal(2, result.Rows.Count);
        Assert.Equal(new DateOnly(2025, 1, 1), result.Rows[0].Date);
        Assert.Equal(10.25, result.Rows[0].Quantity);
    }

    [Fact]
    public void Comma_delimiter_with_quoted_decimal_comma_is_accepted()
    {
        var result = Parse("date,quantity\n2025-01-01,\"12,5\"\n");

        Assert.Empty(result.Errors);
        Assert.Single(result.Rows);
        Assert.Equal(12.5, result.Rows[0].Quantity);
    }

    [Fact]
    public void Comma_delimiter_with_unquoted_decimal_comma_is_rejected_not_misread()
    {
        var result = Parse("date,quantity\n2025-01-01,12,5\n");

        Assert.Empty(result.Rows);
        Assert.Single(result.Errors);
        Assert.Equal(2, result.Errors[0].Line);
    }

    [Fact]
    public void Thousands_separators_are_handled_when_both_symbols_present()
    {
        var result = Parse("date;quantity\n2025-01-01;1.234,56\n2025-01-02;1,234.56\n");

        Assert.Empty(result.Errors);
        Assert.Equal(2, result.Rows.Count);
        Assert.Equal(1234.56, result.Rows[0].Quantity, 5);
        Assert.Equal(1234.56, result.Rows[1].Quantity, 5);
    }

    [Fact]
    public void Invalid_rows_are_reported_with_line_numbers_and_valid_rows_are_kept()
    {
        var text = "date;quantity\n" +
                   "2025-01-01;10\n" +      // line 2 ok
                   "not-a-date;5\n" +     // line 3 error
                   "\n" +                   // line 4 empty, ignored
                   "2025-01-02;abc\n" +     // line 5 error
                   "2025-01-03;-4\n" +      // line 6 error (negative)
                   "2025-01-04;8\n";        // line 7 ok

        var result = Parse(text);

        Assert.Equal(5, result.TotalRows);
        Assert.Equal(2, result.Rows.Count);
        Assert.Equal(3, result.Errors.Count);
        Assert.Equal(new[] { 3, 5, 6 }, result.Errors.Select(e => e.Line).ToArray());
    }

    [Fact]
    public void Header_is_case_insensitive_and_extra_columns_are_ignored()
    {
        var result = Parse("Date;Product;Quantity\n2025-01-01;pane;10\n");

        Assert.Empty(result.Errors);
        Assert.Single(result.Rows);
        Assert.Equal(10.0, result.Rows[0].Quantity);
    }

    [Fact]
    public void Trailing_delimiter_is_not_an_error()
    {
        var result = Parse("date;quantity\n2025-01-01;10;\n");

        Assert.Empty(result.Errors);
        Assert.Single(result.Rows);
    }

    [Fact]
    public void Utf8_bom_in_header_is_ignored()
    {
        var result = Parse("\uFEFFdate,quantity\n2025-01-01,10\n");

        Assert.Null(result.FatalError);
        Assert.Single(result.Rows);
    }

    [Fact]
    public void Missing_columns_is_fatal()
    {
        var result = Parse("giorno,qta\n2025-01-01,10\n");

        Assert.NotNull(result.FatalError);
        Assert.Empty(result.Rows);
    }

    [Fact]
    public void Empty_file_is_fatal()
    {
        var result = Parse("\n  \n");

        Assert.NotNull(result.FatalError);
    }
}
